#include <SDL3/SDL.h>
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

namespace {
constexpr int W=960,H=720, TOP=72, BOTTOM=654;
constexpr float PI=3.14159265f, TILE=32.0f;
struct C { Uint8 r,g,b,a; };
SDL_Window* win=nullptr; SDL_Renderer* ren=nullptr; SDL_Texture* mapTexture=nullptr;
Uint64 prevTicks=0; bool quit=false, mapOpen=false, charging=false, pointerCharge=false;
float anim=0, shiftTime=150, stopTime=28, charge=0, flightTime=0, flightLength=.72f;
float px=70,py=610,vx=0,vy=0, aimX=190,aimY=270, throwX=70,throwY=610,landX=70,landY=610;
float dogX=830,dogY=267, ownerX=0,ownerY=0, detect=0;
int stop=0, score=0, stopScore=0, delivered=0, cleanCards=0, caught=0;
int reason=0,pickup=0,cardField=0;
bool hasParcel=true, parcelGround=false, parcelDelivered=false, ownerActive=false, caughtThisStop=false;
float parcelX=0,parcelY=0, resultQuality=0;
std::string status="BIKE READY. FIVE ADDRESSES. ABSOLUTELY NO COMMISSION.";
enum class Mode { Title,Play,Flight,Card,Escape,Between,Summary };
Mode mode=Mode::Title;

constexpr C ink{15,27,39,255}, paper{244,239,216,255}, white{242,245,232,255};
constexpr C blue{56,118,166,255}, pale{178,211,223,255};
constexpr C gold{255,218,74,255}, red{225,74,61,255}, green{80,192,115,255};
void set(C c){SDL_SetRenderDrawColor(ren,c.r,c.g,c.b,c.a);}
void rect(float x,float y,float w,float h,C c){SDL_FRect r{x,y,w,h};set(c);SDL_RenderFillRect(ren,&r);}
void box(float x,float y,float w,float h,C c){SDL_FRect r{x,y,w,h};set(c);SDL_RenderRect(ren,&r);}
void line(float x,float y,float xx,float yy,C c){set(c);SDL_RenderLine(ren,x,y,xx,yy);}
void circle(float x,float y,float radius,C c){set(c);for(int dy=-(int)radius;dy<=(int)radius;dy++){int dx=(int)std::sqrt(std::max(0.0f,radius*radius-dy*dy));SDL_RenderLine(ren,x-dx,y+dy,x+dx,y+dy);}}

std::array<Uint8,7> glyph(char ch){
 if(ch>='a'&&ch<='z')ch=char(ch-'a'+'A');
#define G(c,a,b,d,e,f,g,h) case c:return {a,b,d,e,f,g,h}
 switch(ch){
 G('A',14,17,17,31,17,17,17);G('B',30,17,17,30,17,17,30);G('C',14,17,16,16,16,17,14);G('D',30,17,17,17,17,17,30);
 G('E',31,16,16,30,16,16,31);G('F',31,16,16,30,16,16,16);G('G',14,17,16,23,17,17,15);G('H',17,17,17,31,17,17,17);
 G('I',14,4,4,4,4,4,14);G('J',7,2,2,2,18,18,12);G('K',17,18,20,24,20,18,17);G('L',16,16,16,16,16,16,31);
 G('M',17,27,21,21,17,17,17);G('N',17,25,25,21,19,19,17);G('O',14,17,17,17,17,17,14);G('P',30,17,17,30,16,16,16);
 G('Q',14,17,17,17,21,18,13);G('R',30,17,17,30,20,18,17);G('S',15,16,16,14,1,1,30);G('T',31,4,4,4,4,4,4);
 G('U',17,17,17,17,17,17,14);G('V',17,17,17,17,17,10,4);G('W',17,17,17,21,21,21,10);G('X',17,17,10,4,10,17,17);
 G('Y',17,17,10,4,4,4,4);G('Z',31,1,2,4,8,16,31);
 G('0',14,17,19,21,25,17,14);G('1',4,12,4,4,4,4,14);G('2',14,17,1,2,4,8,31);G('3',30,1,1,14,1,1,30);
 G('4',2,6,10,18,31,2,2);G('5',31,16,16,30,1,1,30);G('6',14,16,16,30,17,17,14);G('7',31,1,2,4,8,8,8);
 G('8',14,17,17,14,17,17,14);G('9',14,17,17,15,1,1,14);
 G('-',0,0,0,31,0,0,0);G('_',0,0,0,0,0,0,31);G('.',0,0,0,0,0,12,12);G(',',0,0,0,0,4,4,8);
 G(':',0,12,12,0,12,12,0);G('!',4,4,4,4,4,0,4);G('?',14,17,1,2,4,0,4);
 G('/',1,2,2,4,8,8,16);G('+',0,4,4,31,4,4,0);G('=',0,31,0,31,0,0,0);G('(',2,4,8,8,8,4,2);G(')',8,4,2,2,2,4,8);
 G('"',10,10,10,0,0,0,0);G('\'',4,4,8,0,0,0,0);G('#',10,31,10,10,31,10,0);G('%',17,2,4,8,17,0,0);
 default:return {0,0,0,0,0,0,0}; }
#undef G
}
void text(const std::string&s,int x,int y,int z,C c){int ox=x;for(char ch:s){if(ch=='\n'){x=ox;y+=z*10;continue;}if(ch==' '){x+=z*6;continue;}auto g=glyph(ch);for(int j=0;j<7;j++)for(int i=0;i<5;i++)if(g[j]&(1u<<(4-i)))rect(x+i*z,y+j*z,z,z,c);x+=z*6;}}
void center(const std::string&s,int x,int y,int z,C c){text(s,x-(int)s.size()*z*6/2,y,z,c);}
float dist(float x,float y,float xx,float yy){return std::hypot(x-xx,y-yy);}
float clampf(float x,float a,float b){return std::clamp(x,a,b);}
struct House{float x,y,w,h;float sx,sy;const char*addr;const char*note;const char*spot;int reason,pickup;};
const std::array<House,5> houses{{
 {122,108,142,112,193,270,"17 WATTLEBIRD WAY","NO ANSWER. SIGNATURE ITEM.","FRONT PORCH",0,0},
 {407,108,142,112,478,270,"4/2 GUMTREE LANE","GUSTY. KEEP THE PARCEL DRY.","LETTERBOX",1,1},
 {696,108,142,112,767,270,"UNIT 3, 88 CREEK RD","THE DOG KNOWS YOUR ROUTE.","DOORSTEP",2,2},
 {322,482,142,112,393,456,"9 MAGPIE PARADE","NO ANSWER. USE A SAFE PLACE.","UNDER AWNING",0,0},
 {679,482,142,112,750,456,"2 KOOKABURRA CRT","LAST PARCEL. LAST CHANCE.","FRONT PORCH",1,1}
}};
const char* reasons[]={"NO ANSWER","UNSAFE TO LEAVE","SIGNATURE REQUIRED"};
const char* pickups[]={"KOOKABURRA LPO","PARCEL LOCKER","CENTRAL DEPOT"};
struct Tree{float x,y,r;};
const std::array<Tree,11> trees{{{77,151,19},{332,150,18},{620,155,20},{882,151,20},{350,275,18},{612,275,19},{886,275,19},{79,477,20},{525,520,20},{589,509,18},{884,526,20}}};

void startStop(){mode=Mode::Play;stopTime=28;charge=0;charging=false;pointerCharge=false;hasParcel=true;parcelGround=false;parcelDelivered=false;ownerActive=false;caughtThisStop=false;detect=.04f;reason=0;pickup=0;cardField=0;aimX=houses[stop].sx;aimY=houses[stop].sy;status=std::string("NEXT: ")+houses[stop].addr+"  /  FIND THE GOLD DROP MARK";}
void startShift(){stop=score=stopScore=delivered=cleanCards=caught=0;shiftTime=150;px=70;py=610;dogX=830;dogY=267;mapOpen=false;startStop();}
void caughtPenalty(){if(caughtThisStop)return;caughtThisStop=true;caught++;shiftTime=std::max(0.0f,shiftTime-6);detect=.45f;status="CAUGHT! APOLOGISE, LOSE SIX SECONDS, KEEP PEDALLING.";}

bool insideHouse(float x,float y,float r){for(const auto&h:houses)if(x+r>h.x&&x-r<h.x+h.w&&y+r>h.y&&y-r<h.y+h.h)return true;return false;}
bool solid(float x,float y){constexpr float r=10;if(x<18||x>942||y<TOP+12||y>BOTTOM-12)return true;if(insideHouse(x,y,r))return true;
 for(auto t:trees)if(dist(x,y,t.x,t.y)<t.r+8)return true;
 // Low garden fences have a walk-through gate aligned with each front path.
 for(int i=0;i<5;i++){const auto&h=houses[i];float fy=i<3?298:465;float lo=h.x-18,hi=h.x+h.w+18;if(std::abs(y-fy)<8&&x>lo&&x<hi&&std::abs(x-h.sx)>23)return true;}
 return false;}
void movePlayer(float dx,float dy){float nx=px+dx,ny=py+dy;if(!solid(nx,py))px=nx;if(!solid(px,ny))py=ny;}
float windForStop(){return stop==1?.30f:stop==3?.12f:stop==4?-.18f:0.0f;}
float throwRange(){return 72.0f+charge*330.0f;}
void launch(){if(mode!=Mode::Play||!hasParcel)return;charging=false;pointerCharge=false;mode=Mode::Flight;flightTime=0;throwX=px;throwY=py;
 float dx=aimX-px,dy=aimY-py,d=std::hypot(dx,dy);if(d<1){dx=1;dy=0;d=1;}float r=std::min(d,throwRange());float wind=windForStop()*charge*75.0f;
 landX=px+dx/d*r+wind;landY=py+dy/d*r;landX=clampf(landX,20,940);landY=clampf(landY,TOP+10,BOTTOM-10);flightLength=clampf(.36f+d/560.0f,.42f,1.2f);hasParcel=false;status="PARCEL AIRBORNE. POSTIE, PLEASE DO NOT PANIC.";}
bool hazardAt(float x,float y){if(insideHouse(x,y,1))return true;for(auto t:trees)if(dist(x,y,t.x,t.y)<t.r+4)return true;return false;}
void beginCard(){mode=Mode::Card;stopTime=std::min(stopTime,13.0f);reason=0;pickup=0;cardField=0;ownerActive=true;const House&h=houses[stop];ownerX=h.sx;ownerY=h.sy+(stop<3?35:-35);status="CARD OUT! PICK THE REASON AND COLLECTION POINT.";}
void landParcel(){parcelX=landX;parcelY=landY;const House&h=houses[stop];float miss=dist(landX,landY,h.sx,h.sy);bool reachable=dist(throwX,throwY,h.sx,h.sy)<=throwRange()+14;
 bool safe=miss<42&&reachable&&!hazardAt(landX,landY);
 resultQuality=clampf(1.0f-miss/90.0f,0.0f,1.0f);
 if(safe){parcelDelivered=true;parcelGround=false;delivered++;beginCard();}
 else{mode=Mode::Play;parcelGround=true;hasParcel=false;status=hazardAt(landX,landY)?"BONK! TREE / ROOF / GNOME. PRESS E NEAR PARCEL TO RETRY.":"MISSED THE SAFE ZONE. PRESS E NEAR PARCEL TO RETRY.";}
}
void stamp(){if(mode!=Mode::Card)return;const House&h=houses[stop];bool good=reason==h.reason&&pickup==h.pickup;if(good)cleanCards++;else{detect=std::min(1.0f,detect+.18f);status="FORM FILED. IN ANOTHER POSTCODE, APPARENTLY.";}
 stopScore=45+(parcelDelivered?145+(int)(resultQuality*45):-35)+(good?85:-30)+(shiftTime>55?35:0);score+=std::max(0,stopScore);mode=Mode::Escape;caughtThisStop=false;status=good?"KA-CHUNK! NOW GET BACK TO YOUR BIKE.":"STAMPED. BIKE IS THAT WAY. QUICKLY.";}
void finishStop(){mode=Mode::Between;status="BACK AT THE BIKE. ROUTE SHEET UPDATED.";}
void nextStop(){if(stop+1>=5||shiftTime<=0){mode=Mode::Summary;status="SHIFT COMPLETE. FILE YOUR OWN COMPLAINT.";return;}stop++;px=70;py=610;startStop();}

void drawGround(){rect(0,TOP,W,BOTTOM-TOP,C{83,145,80,255});
 // Repeating grass is generated from the map grid, not loaded from a backdrop.
 for(int y=TOP;y<BOTTOM;y+=TILE)for(int x=0;x<W;x+=TILE){unsigned n=(unsigned)(x*73856093u)^(unsigned)(y*19349663u);int v=(n%7)-3;rect(x,y,TILE,TILE,C{(Uint8)(83+v),(Uint8)(145+v*2),(Uint8)(78+v),255});if(n%3==0)rect(x+(n%23),y+((n>>8)%24),2,2,C{105,164,91,255});}
 // kerbs, broad asphalt, lane markings, and a painted crossing
 rect(0,310,W,17,C{183,179,137,255});rect(0,327,W,78,C{62,72,75,255});rect(0,405,W,17,C{183,179,137,255});
 for(int x=12;x<W;x+=58)rect(x,365,30,3,C{221,211,159,255});
 for(int i=0;i<6;i++)rect(438+i*16,333,9,65,C{214,210,178,255});
 // paths from each porch, through the gate, to the footpath
 for(int i=0;i<5;i++){const House&h=houses[i];float start=i<3?h.y+h.h:h.y;float end=i<3?298:465;float y=std::min(start,end),hh=std::abs(end-start);rect(h.sx-14,y,28,hh,C{185,171,135,255});rect(h.sx-2,y,4,hh,C{208,196,158,255});}
 rect(52,594,88,42,C{179,174,136,255});rect(54,596,84,38,C{193,186,146,255});rect(108,418,24,178,C{181,173,139,255});rect(111,418,4,178,C{204,195,157,255});
}
void drawTree(Tree t){circle(t.x,t.y+8,t.r+3,C{47,93,48,255});circle(t.x,t.y,t.r,C{38,105,56,255});circle(t.x-7,t.y-5,t.r*.62f,C{61,135,67,255});circle(t.x+8,t.y-7,t.r*.53f,C{77,149,72,255});circle(t.x,t.y-12,3,C{140,180,84,255});}
void drawHouse(int i){const House&h=houses[i];bool top=i<3;float fy=top?298:465;
 // lawns, garden border, picket fence and an open gate aligned to the path
 rect(h.x-20,top?84:437,h.w+40,top?220:214,C{95,159,83,255});
 for(float x=h.x-18;x<h.x+h.w+18;x+=14){if(std::abs(x-h.sx)<25)continue;rect(x,fy-3,3,9,C{222,211,169,255});rect(x-2,fy-3,7,2,C{235,224,189,255});}
 rect(h.x-18,top?91:590,3,top?207:0,C{222,211,169,255});rect(h.x+h.w+15,top?91:590,3,top?207:0,C{222,211,169,255});
 // roof silhouette + eaves + wall sides gives a readable overhead house footprint
 rect(h.x-5,h.y+8,h.w+10,h.h+8,C{104,67,48,255});rect(h.x,h.y,h.w,h.h,C{188,91,62,255});
 rect(h.x+5,h.y+5,h.w-10,h.h-10,C{172,75,57,255});
 for(int yy=0;yy<3;yy++)rect(h.x+7,h.y+12+yy*28,h.w-14,3,C{145,62,50,255});
 for(int xx=0;xx<3;xx++)rect(h.x+24+xx*40,h.y+8,3,h.h-16,C{145,62,50,255});
 // pitched-looking roof ridge + chimney
 rect(h.x+12,h.y+12,h.w-24,5,C{215,125,77,255});rect(h.x+12,h.y+h.h-16,h.w-24,5,C{215,125,77,255});
 rect(h.x+17,h.y+35,24,19,C{91,169,180,255});box(h.x+17,h.y+35,24,19,C{239,205,145,255});line(h.x+29,h.y+36,h.x+29,h.y+53,C{239,205,145,255});line(h.x+18,h.y+44,h.x+39,h.y+44,C{239,205,145,255});
 rect(h.x+h.w-41,h.y+35,24,19,C{91,169,180,255});box(h.x+h.w-41,h.y+35,24,19,C{239,205,145,255});line(h.x+h.w-29,h.y+36,h.x+h.w-29,h.y+53,C{239,205,145,255});line(h.x+h.w-40,h.y+44,h.x+h.w-19,h.y+44,C{239,205,145,255});
 // front door points toward the pavement
 float dy=top?h.y+h.h-3:h.y-14;rect(h.sx-10,dy,20,21,C{91,57,41,255});rect(h.sx-7,dy+3,14,17,C{137,88,51,255});circle(h.sx+4,dy+11,1.8f,gold);
 // porch and parcel drop mark
 if(top)rect(h.sx-20,h.y+h.h+5,40,12,C{223,208,170,255});else rect(h.sx-20,h.y-13,40,12,C{223,208,170,255});
 // letterbox beside the front walk
 rect(h.sx+27,h.sy-4,6,18,C{63,73,79,255});rect(h.sx+22,h.sy-12,16,10,C{203,62,52,255});rect(h.sx+25,h.sy-9,10,3,C{235,220,180,255});
 // gnome: harmlessly suspicious and a genuine throw obstacle
 float gx=h.sx-48,gy=h.sy+20;circle(gx,gy,8,C{227,205,158,255});rect(gx-6,gy-2,12,10,C{58,111,172,255});rect(gx-5,gy-12,10,8,C{191,57,50,255});circle(gx,gy-13,4,C{200,71,55,255});
}
void drawBike(){circle(51,610,10,C{23,33,39,255});circle(100,610,10,C{23,33,39,255});circle(51,610,6,C{171,187,178,255});circle(100,610,6,C{171,187,178,255});line(51,610,70,588,C{57,78,87,255});line(70,588,100,610,C{57,78,87,255});line(51,610,82,610,C{57,78,87,255});line(70,588,82,610,C{57,78,87,255});line(65,585,76,585,C{24,36,41,255});line(95,602,103,598,C{24,36,41,255});rect(72,580,19,15,C{201,52,45,255});rect(75,583,12,4,C{244,218,71,255});}
void drawPostie(){circle(px,py+8,11,C{37,69,48,170});int step=(int)(anim*11)%2;rect(px-5+step,py+3,4,8,C{39,53,70,255});rect(px+1-step,py+3,4,8,C{39,53,70,255});rect(px-8,py-8,16,15,C{38,105,176,255});rect(px-10,py-5,4,9,C{233,187,144,255});rect(px+6,py-5,4,9,C{233,187,144,255});rect(px-7,py-17,14,10,C{225,185,142,255});rect(px-9,py-19,18,5,C{203,52,44,255});rect(px-5,py-23,10,5,C{203,52,44,255});rect(px+5,py-4,5,8,C{189,51,45,255});rect(px-3,py-15,2,2,ink);rect(px+3,py-15,2,2,ink);if(hasParcel){rect(px+9,py-8,9,9,C{169,111,56,255});line(px+13,py-8,px+13,py+1,C{211,69,56,255});}}
void drawDog(){float x=830+std::sin(anim*1.3f)*22,y=270+std::sin(anim*2.1f)*8;dogX=x;dogY=y;circle(x,y+4,12,C{46,42,36,190});rect(x-10,y-8,20,15,C{198,153,93,255});circle(x+7,y-6,7,C{210,165,99,255});rect(x-9,y+5,4,8,C{95,69,49,255});rect(x+5,y+5,4,8,C{95,69,49,255});circle(x+9,y-7,1.5f,ink);line(x-9,y-5,x-15,y-11,C{198,153,93,255});if(stop==2){center("!",(int)x,(int)y-28,2,red);}}
void drawOwner(){if(!ownerActive)return;circle(ownerX,ownerY+6,10,C{44,56,44,160});rect(ownerX-7,ownerY-8,14,15,C{207,149,92,255});rect(ownerX-9,ownerY-17,18,10,C{240,213,164,255});rect(ownerX-9,ownerY-19,18,5,C{74,116,75,255});circle(ownerX-3,ownerY-13,1.5f,ink);circle(ownerX+3,ownerY-13,1.5f,ink);}
void drawTarget(){if(mode!=Mode::Play&&mode!=Mode::Flight)return;const House&h=houses[stop];for(int i=0;i<4;i++){float angle=anim*1.6f+i*PI/2;float x=h.sx+std::cos(angle)*25,y=h.sy+std::sin(angle)*18;circle(x,y,3,gold);}box(h.sx-22,h.sy-16,44,32,C{255,230,102,230});center(h.spot,(int)h.sx,(int)h.sy-32,1,white);
 if(mode==Mode::Play&&hasParcel){float d=dist(px,py,aimX,aimY),r=std::min(d,throwRange());float x=px+(aimX-px)/(d?d:1)*r,y=py+(aimY-py)/(d?d:1)*r;for(int i=0;i<13;i+=2){float t=i/12.0f;circle(px+(x-px)*t,py+(y-py)*t-std::sin(PI*t)*(32+charge*25),2,C{255,240,171,230});}box(x-5,y-5,10,10,gold);}}
void drawParcelAt(float x,float y,float z){circle(x,y+2,10,C{35,40,31,140});rect(x-8,y-8-z,16,16,C{173,116,59,255});rect(x-8,y-8-z,16,3,C{224,170,97,255});rect(x-1,y-8-z,4,16,C{203,57,48,255});box(x-8,y-8-z,16,16,C{98,67,43,255});}
void drawStaticWorld(){drawGround();for(int i=0;i<5;i++)drawHouse(i);for(auto t:trees)drawTree(t);drawBike();}
void drawWorld(){if(mapTexture){SDL_FRect dst{0,0,(float)W,(float)H};SDL_RenderTexture(ren,mapTexture,nullptr,&dst);}else drawStaticWorld();drawDog();drawOwner();drawTarget();drawPostie();
 if(parcelGround)drawParcelAt(parcelX,parcelY,0);
 if(mode==Mode::Flight){float t=clampf(flightTime/flightLength,0,1);float x=throwX+(landX-throwX)*t,y=throwY+(landY-throwY)*t,z=std::sin(PI*t)*(38+charge*24);drawParcelAt(x,y,z);}
 if(mode==Mode::Escape){rect(24,TOP+9,140,28,C{10,28,42,210});text("BIKE ->",34,TOP+18,1,gold);line(108,TOP+23,px,py, C{255,222,82,170});}
}
void drawHud(){rect(0,0,W,TOP,C{23,48,68,255});rect(0,TOP-3,W,3,C{139,178,180,255});
 text("AUSPOST / DELIVERY SHIFT",17,13,2,white);text("KOOKABURRA DISTRICT  -  1997",17,43,1,pale);
 rect(355,12,264,46,C{10,28,42,255});text((std::string("STOP ")+std::to_string(std::min(stop+1,5))+" / 5").c_str(),369,20,2,gold);text(houses[stop].addr,369,43,1,white);
 rect(638,12,144,46,C{10,28,42,255});text("SHIFT",650,19,1,pale);char tb[24];std::snprintf(tb,sizeof tb,"%02d:%02d",std::max(0,(int)shiftTime)/60,std::max(0,(int)shiftTime)%60);text(tb,650,34,2,shiftTime<25?red:white);
 rect(800,12,143,46,C{10,28,42,255});text("SCORE",812,19,1,pale);char sb[24];std::snprintf(sb,sizeof sb,"%06d",score);text(sb,812,34,2,gold);
 // bottom HUD is drawn separately after world in draw()
}
void drawBottom(){rect(0,BOTTOM,W,H-BOTTOM,C{18,43,60,255});rect(0,BOTTOM,W,2,C{136,171,166,255});
 text(status,17,BOTTOM+10,1,white);text("ARROWS/WASD MOVE   SHIFT SPRINT   MOUSE AIM   HOLD+RELEASE SPACE THROW",17,BOTTOM+30,1,pale);
 text("E PICK UP",17,BOTTOM+48,1,gold);text("TAB ROUTE",128,BOTTOM+48,1,gold);
 rect(670,BOTTOM+12,265,15,C{48,65,70,255});rect(670,BOTTOM+12,265*clampf(detect,0,1),15,detect>.68f?red:C{229,165,65,255});box(670,BOTTOM+12,265,15,C{171,193,179,255});text("SUSPICION",670,BOTTOM+34,1,pale);
 if(mode==Mode::Play&&hasParcel){rect(410,BOTTOM+49,235,8,C{47,62,65,255});rect(410,BOTTOM+49,235*charge,8,charge>.82?red:gold);}
}
void panel(float x,float y,float w,float h){rect(x,y,w,h,C{12,28,43,245});box(x,y,w,h,C{220,210,171,255});rect(x+4,y+4,w-8,2,C{94,145,163,255});}
void drawTitle(){rect(0,TOP,W,BOTTOM-TOP,C{13,29,34,170});panel(184,214,592,310);center("AUSPOST SIMULATOR",480,246,4,white);center("DELIVERY ATTEMPT",480,284,2,gold);center("A REAL SUBURBAN ROUTE. WALK IT YOURSELF.",480,330,1,pale);center("FIND THE DROP ZONE  /  CHARGE A THROW  /  FILE THE CARD",480,364,1,white);center("AVOID THE DOG. RETURN TO YOUR BIKE. REPEAT.",480,386,1,white);rect(350,429,260,43,C{166,96,35,255});box(350,429,260,43,gold);center("ENTER TO START SHIFT",480,445,1,white);center("MOVE: ARROWS/WASD    THROW: HOLD SPACE    PICK UP: E",480,492,1,pale);}
void drawCard(){rect(0,TOP,W,BOTTOM-TOP,C{9,20,29,170});panel(225,119,510,473);rect(239,132,482,42,C{45,86,111,255});rect(239,174,482,405,paper);text("FORM 97-B / DELIVERY ATTEMPT",257,147,2,white);text(houses[stop].addr,258,191,2,ink);text(houses[stop].note,258,218,1,C{70,75,68,255});line(255,238,705,238,C{139,145,132,255});text("01  REASON FOR CARD",258,252,1,blue);
 for(int i=0;i<3;i++){int y=274+i*27;if(i==reason&&cardField==0)rect(251,y-4,454,23,C{255,222,89,150});box(264,y,12,12,blue);if(i==reason)rect(267,y+3,6,6,blue);text(std::string(1,char('A'+i))+"  "+reasons[i],287,y+1,1,ink);}
 text("02  COLLECT FROM",258,367,1,blue);for(int i=0;i<3;i++){int y=388+i*27;if(i==pickup&&cardField==1)rect(251,y-4,454,23,C{255,222,89,150});box(264,y,12,12,blue);if(i==pickup)rect(267,y+3,6,6,blue);text(std::string(1,char('A'+i))+"  "+pickups[i],287,y+1,1,ink);}
 text("THE CUSTOMER WILL DEFINITELY READ THIS.",258,484,1,C{70,75,68,255});rect(526,514,172,38,C{161,61,48,255});box(526,514,172,38,C{235,207,158,255});center(cardField==0?"ENTER: NEXT":"ENTER: STAMP",612,528,1,white);
 rect(258,556,444,9,C{184,187,169,255});rect(258,556,444*clampf(stopTime/13,0,1),9,stopTime<4?red:green);}
void drawBetween(){rect(0,TOP,W,BOTTOM-TOP,C{9,20,29,160});panel(278,243,404,188);center(parcelDelivered?"PARCEL DELIVERED":"SHIFT OVER",480,271,2,green);center("CARD FILED. BIKE IS WAITING.",480,310,1,white);char s[80];std::snprintf(s,sizeof s,"STOP +%03d     ROUTE %06d",stopScore,score);center(s,480,344,2,gold);center("PRESS ENTER TO ROLL OUT",480,391,1,pale);}
void drawSummary(){rect(0,TOP,W,BOTTOM-TOP,C{8,17,26,190});panel(240,169,480,368);center("SHIFT COMPLETE",480,203,4,gold);center("KOOKABURRA DISTRICT / ROUTE 03",480,253,1,pale);char s[48];std::snprintf(s,sizeof s,"%06d POINTS",score);center(s,480,300,4,white);center((std::to_string(delivered)+" / 5 DELIVERED").c_str(),480,377,2,green);center((std::to_string(cleanCards)+" CLEAN CARDS").c_str(),480,409,1,pale);center((std::to_string(caught)+" AWKWARD INTERACTIONS").c_str(),480,432,1,pale);rect(365,467,230,38,C{157,90,32,255});center("ENTER TO RIDE AGAIN",480,480,1,white);}
void drawMap(){rect(0,TOP,W,BOTTOM-TOP,C{7,18,27,218});panel(230,120,500,475);center("ROUTE SHEET / 03",480,151,2,gold);for(int i=0;i<5;i++){int y=198+i*67;rect(261,y,438,54,C{17,39,54,255});box(261,y,438,54,C{76,115,126,255});C c=i<stop?green:i==stop?gold:pale;circle(283,y+27,9,c);text(std::to_string(i+1)+"  "+houses[i].addr,306,y+12,1,white);text(i<stop?"DONE":i==stop?"CURRENT":"WAITING",306,y+32,1,c);}center("TAB TO CLOSE",480,558,1,pale);}
void draw(){set(C{12,25,33,255});SDL_RenderClear(ren);drawHud();drawWorld();drawBottom();if(mode==Mode::Title)drawTitle();if(mode==Mode::Card)drawCard();if(mode==Mode::Between)drawBetween();if(mode==Mode::Summary)drawSummary();if(mapOpen)drawMap();SDL_RenderPresent(ren);}

void selectCardAt(int x,int y){if(y>=268&&y<351){reason=clampf((y-268)/27,0,2);cardField=0;}else if(y>=382&&y<463){pickup=clampf((y-382)/27,0,2);cardField=1;}else if(x>510&&y>510&&y<560)stamp();}
void doKey(SDL_Keycode k,SDL_Scancode sc){if(k==SDLK_TAB){mapOpen=!mapOpen;return;}if(sc==SDL_SCANCODE_R){startShift();return;}if(k==SDLK_ESCAPE){if(mapOpen)mapOpen=false;else mode=Mode::Title;return;}
 if(k==SDLK_RETURN||k==SDLK_KP_ENTER){if(mode==Mode::Title){startShift();return;}if(mode==Mode::Card){if(cardField==0)cardField=1;else stamp();return;}if(mode==Mode::Between){nextStop();return;}if(mode==Mode::Summary){startShift();return;}}
 if(mode==Mode::Play){if(k==SDLK_SPACE&&hasParcel){charging=true;charge=0;return;}if(k==SDLK_E){if(parcelGround&&dist(px,py,parcelX,parcelY)<34){parcelGround=false;hasParcel=true;status="PACKAGE RECOVERED. TRY THAT DROP AGAIN.";}else if(dist(px,py,70,610)<42){status="BIKE BAG CHECKED. ROUTE PARCEL READY.";}return;}}
 if(mode==Mode::Card){if(k==SDLK_UP||k==SDLK_W){if(cardField==0)reason=(reason+2)%3;else pickup=(pickup+2)%3;}else if(k==SDLK_DOWN||k==SDLK_S){if(cardField==0)reason=(reason+1)%3;else pickup=(pickup+1)%3;}else if(k==SDLK_LEFT||k==SDLK_A)cardField=0;else if(k==SDLK_RIGHT||k==SDLK_D)cardField=1;else if(k==SDLK_1||k==SDLK_2||k==SDLK_3){int q=(int)(k-SDLK_1);if(cardField==0)reason=q;else pickup=q;}}
}
void update(float dt){anim+=dt;if(mode==Mode::Title||mode==Mode::Summary||mode==Mode::Between)return;shiftTime-=dt;if(shiftTime<=0){mode=Mode::Summary;status="SHIFT CLOCK EXPIRED. THE MANAGER HAS A CLIPBOARD.";return;}stopTime-=dt;
 const bool*keys=SDL_GetKeyboardState(nullptr);float dx=(keys[SDL_SCANCODE_RIGHT]||keys[SDL_SCANCODE_D])-(keys[SDL_SCANCODE_LEFT]||keys[SDL_SCANCODE_A]);float dy=(keys[SDL_SCANCODE_DOWN]||keys[SDL_SCANCODE_S])-(keys[SDL_SCANCODE_UP]||keys[SDL_SCANCODE_W]);float mag=std::hypot(dx,dy);if(mag>0){dx/=mag;dy/=mag;bool sprint=keys[SDL_SCANCODE_LSHIFT]||keys[SDL_SCANCODE_RSHIFT];float speed=sprint?195.0f:132.0f;if(mode==Mode::Card) speed=0;vx=dx*speed;vy=dy*speed;movePlayer(vx*dt,vy*dt);}else vx=vy=0;
 dogX=830+std::sin(anim*1.3f)*22;dogY=270+std::sin(anim*2.1f)*8;
 if(mode==Mode::Play){if(charging)charge=std::min(1.0f,charge+dt*.62f);stopTime-=0;float d=dist(px,py,dogX,dogY);if(stop==2&&d<145){detect=std::min(1.0f,detect+dt*(.08f+(145-d)*.0008f));if(d<90)status="THE DOG IS JUDGING YOUR LINE. KEEP MOVING.";}else detect=std::max(.03f,detect-dt*.08f);if(detect>=1)caughtPenalty();if(stopTime<=0){status="THE DELIVERY WINDOW CLOSED. CARD ANYWAY.";beginCard();}}
 else if(mode==Mode::Flight){flightTime+=dt;if(flightTime>=flightLength)landParcel();}
 else if(mode==Mode::Card){detect=std::min(1.0f,detect+dt*.023f);if(stopTime<=0){stamp();status="FORM TIMED OUT. THE OFFICE WILL NOT BE PLEASED.";}}
 else if(mode==Mode::Escape){float d=dist(px,py,ownerX,ownerY);float ox=px-ownerX,oy=py-ownerY;if(d>1){float sp=78*dt;ownerX+=ox/d*sp;ownerY+=oy/d*sp;}detect=std::min(1.0f,detect+dt*.009f);if(d<26||detect>=1){caughtPenalty();ownerActive=false;}if(dist(px,py,70,610)<34)finishStop();}
}
void frame(){Uint64 now=SDL_GetTicks();float dt=prevTicks?clampf((now-prevTicks)/1000.0f,0,.04f):.016f;prevTicks=now;SDL_Event e;while(SDL_PollEvent(&e)){if(e.type==SDL_EVENT_QUIT)quit=true;
 if(e.type==SDL_EVENT_KEY_DOWN&&!e.key.repeat){if(e.key.key==SDLK_SPACE&&mode==Mode::Play&&hasParcel){charging=true;charge=0;}else doKey(e.key.key,e.key.scancode);}
 if(e.type==SDL_EVENT_KEY_UP&&e.key.key==SDLK_SPACE&&charging)launch();
 if(e.type==SDL_EVENT_MOUSE_MOTION||e.type==SDL_EVENT_MOUSE_BUTTON_DOWN||e.type==SDL_EVENT_MOUSE_BUTTON_UP){SDL_Event q=e;SDL_ConvertEventToRenderCoordinates(ren,&q);if(q.type==SDL_EVENT_MOUSE_MOTION){if(q.motion.y>=TOP&&q.motion.y<=BOTTOM){aimX=clampf(q.motion.x,0,W);aimY=clampf(q.motion.y,TOP,BOTTOM);}}else if(q.type==SDL_EVENT_MOUSE_BUTTON_DOWN&&q.button.button==SDL_BUTTON_LEFT){if(mode==Mode::Play&&hasParcel&&q.button.y>BOTTOM){charging=true;pointerCharge=true;charge=0;}else{aimX=q.button.x;aimY=q.button.y;}}else if(q.type==SDL_EVENT_MOUSE_BUTTON_UP&&q.button.button==SDL_BUTTON_LEFT){if(pointerCharge){pointerCharge=false;launch();}else if(mode==Mode::Title)startShift();else if(mode==Mode::Card)selectCardAt(q.button.x,q.button.y);else if(mode==Mode::Between)nextStop();else if(mode==Mode::Summary)startShift();}}
 if(e.type==SDL_EVENT_FINGER_DOWN&&mode==Mode::Play){float x=e.tfinger.x*W,y=e.tfinger.y*H;aimX=x;aimY=y;charging=true;pointerCharge=true;charge=0;}
 if(e.type==SDL_EVENT_FINGER_MOTION&&pointerCharge){aimX=e.tfinger.x*W;aimY=e.tfinger.y*H;}
 if(e.type==SDL_EVENT_FINGER_UP&&pointerCharge){pointerCharge=false;launch();}
 }
 update(dt);draw();
#ifdef __EMSCRIPTEN__
 if(quit) emscripten_cancel_main_loop();
#endif
}
}

int main(int, char**){
 if(!SDL_Init(SDL_INIT_VIDEO|SDL_INIT_EVENTS)){std::fprintf(stderr,"SDL_Init: %s\n",SDL_GetError());return 1;}
 win=SDL_CreateWindow("AusPost Simulator - Delivery Attempt",W,H,SDL_WINDOW_RESIZABLE|SDL_WINDOW_HIGH_PIXEL_DENSITY);
 if(!win){std::fprintf(stderr,"SDL_CreateWindow: %s\n",SDL_GetError());SDL_Quit();return 1;}
 ren=SDL_CreateRenderer(win,nullptr);if(!ren){std::fprintf(stderr,"SDL_CreateRenderer: %s\n",SDL_GetError());SDL_DestroyWindow(win);SDL_Quit();return 1;}
 SDL_SetRenderLogicalPresentation(ren,W,H,SDL_LOGICAL_PRESENTATION_LETTERBOX);SDL_SetRenderVSync(ren,1);SDL_SetRenderDrawBlendMode(ren,SDL_BLENDMODE_BLEND);
 mapTexture=SDL_CreateTexture(ren,SDL_PIXELFORMAT_RGBA32,SDL_TEXTUREACCESS_TARGET,W,H);
 if(mapTexture){SDL_SetTextureScaleMode(mapTexture,SDL_SCALEMODE_NEAREST);SDL_SetTextureBlendMode(mapTexture,SDL_BLENDMODE_BLEND);SDL_SetRenderTarget(ren,mapTexture);SDL_SetRenderDrawColor(ren,0,0,0,0);SDL_RenderClear(ren);drawStaticWorld();SDL_SetRenderTarget(ren,nullptr);}
 prevTicks=SDL_GetTicks();
#ifdef __EMSCRIPTEN__
 emscripten_set_main_loop(frame,0,1);
#else
 while(!quit)frame();
#endif
 if(mapTexture) SDL_DestroyTexture(mapTexture);
 SDL_DestroyRenderer(ren);SDL_DestroyWindow(win);SDL_Quit();return 0;
}

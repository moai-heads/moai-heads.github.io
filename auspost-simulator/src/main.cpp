#include <SDL3/SDL.h>
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

namespace {
constexpr int W = 1448, H = 1086;
constexpr int WORLD_X = 132, WORLD_Y = 254, WORLD_W = 1298, WORLD_H = 768;
constexpr float THROW_X = 577.0f, THROW_Y = 694.0f;
constexpr float PI = 3.1415926535f;
struct Color { Uint8 r,g,b,a; };
SDL_Window* window = nullptr;
SDL_Renderer* renderer = nullptr;
SDL_Texture* yard = nullptr;
std::string capturePath;
bool quitRequested = false;
Uint64 previousTicks = 0;

Color ink{11,25,48,255}, lightBlue{118,174,228,255};
Color white{228,239,247,255}, muted{137,169,203,255}, gold{255,225,60,255};
Color green{87,221,147,255}, red{246,74,78,255}, orange{255,162,67,255};

void color(Color c) { SDL_SetRenderDrawColor(renderer,c.r,c.g,c.b,c.a); }
void fill(float x,float y,float w,float h,Color c) {
    SDL_FRect r{x,y,w,h}; color(c); SDL_RenderFillRect(renderer,&r);
}
void outline(float x,float y,float w,float h,Color c) {
    SDL_FRect r{x,y,w,h}; color(c); SDL_RenderRect(renderer,&r);
}
void line(float x1,float y1,float x2,float y2,Color c) {
    color(c); SDL_RenderLine(renderer,x1,y1,x2,y2);
}
void bevel(int x,int y,int w,int h,Color base,bool raised=true) {
    fill(x,y,w,h,base);
    Color hi = raised ? Color{152,193,230,255} : Color{20,41,68,255};
    Color lo = raised ? Color{17,37,65,255} : Color{112,158,209,255};
    fill(x,y,w,2,hi); fill(x,y,2,h,hi);
    fill(x+w-2,y,2,h,lo); fill(x,y+h-2,w,2,lo);
    fill(x+3,y+3,w-6,1,raised?Color{72,117,171,255}:Color{8,22,42,255});
}

std::array<Uint8,7> glyph(char ch) {
    if(ch>='a'&&ch<='z') ch=char(ch-'a'+'A');
#define G(c,a,b,d,e,f,g,h) case c: return {a,b,d,e,f,g,h}
    switch(ch) {
    G('A',14,17,17,31,17,17,17); G('B',30,17,17,30,17,17,30);
    G('C',14,17,16,16,16,17,14); G('D',30,17,17,17,17,17,30);
    G('E',31,16,16,30,16,16,31); G('F',31,16,16,30,16,16,16);
    G('G',14,17,16,23,17,17,15); G('H',17,17,17,31,17,17,17);
    G('I',14,4,4,4,4,4,14); G('J',7,2,2,2,18,18,12);
    G('K',17,18,20,24,20,18,17); G('L',16,16,16,16,16,16,31);
    G('M',17,27,21,21,17,17,17); G('N',17,25,25,21,19,19,17);
    G('O',14,17,17,17,17,17,14); G('P',30,17,17,30,16,16,16);
    G('Q',14,17,17,17,21,18,13); G('R',30,17,17,30,20,18,17);
    G('S',15,16,16,14,1,1,30); G('T',31,4,4,4,4,4,4);
    G('U',17,17,17,17,17,17,14); G('V',17,17,17,17,17,10,4);
    G('W',17,17,17,21,21,21,10); G('X',17,17,10,4,10,17,17);
    G('Y',17,17,10,4,4,4,4); G('Z',31,1,2,4,8,16,31);
    G('0',14,17,19,21,25,17,14); G('1',4,12,4,4,4,4,14);
    G('2',14,17,1,2,4,8,31); G('3',30,1,1,14,1,1,30);
    G('4',2,6,10,18,31,2,2); G('5',31,16,16,30,1,1,30);
    G('6',14,16,16,30,17,17,14); G('7',31,1,2,4,8,8,8);
    G('8',14,17,17,14,17,17,14); G('9',14,17,17,15,1,1,14);
    G('-',0,0,0,31,0,0,0); G('_',0,0,0,0,0,0,31);
    G('.',0,0,0,0,0,12,12); G(',',0,0,0,0,4,4,8);
    G(':',0,12,12,0,12,12,0); G(';',0,12,12,0,4,4,8);
    G('!',4,4,4,4,4,0,4); G('?',14,17,1,2,4,0,4);
    G('/',1,2,2,4,8,8,16); G('\\',16,8,8,4,2,2,1);
    G('(',2,4,8,8,8,4,2); G(')',8,4,2,2,2,4,8);
    G('=',0,31,0,31,0,0,0); G('+',0,4,4,31,4,4,0);
    G('>',16,8,4,2,4,8,16); G('<',1,2,4,8,4,2,1);
    G('"',10,10,10,0,0,0,0); G('\'',4,4,8,0,0,0,0);
    G('#',10,31,10,10,31,10,0); G('*',0,21,14,31,14,21,0);
    G('[',14,8,8,8,8,8,14); G(']',14,2,2,2,2,2,14);
    G('%',17,2,4,8,17,0,0); G('@',14,17,23,21,23,16,14);
    default: return {0,0,0,0,0,0,0};
    }
#undef G
}
void text(const std::string& s,int x,int y,int scale,Color c) {
    int ox=x;
    for(unsigned char raw:s) {
        char ch=(char)raw;
        if(ch=='\n'){y+=scale*10;x=ox;continue;}
        if(ch==' '){x+=scale*6;continue;}
        auto rows=glyph(ch);
        for(int yy=0;yy<7;++yy) for(int xx=0;xx<5;++xx)
            if(rows[yy]&(1u<<(4-xx))) fill(x+xx*scale,y+yy*scale,scale,scale,c);
        x+=scale*6;
    }
}
int tw(const std::string&s,int scale){return (int)s.size()*scale*6;}
void centerText(const std::string&s,int cx,int y,int scale,Color c){text(s,cx-tw(s,scale)/2,y,scale,c);}
void dashedRect(int x,int y,int w,int h,Color c,int dash=12) {
    for(int p=0;p<w;p+=dash*2){fill(x+p,y,std::min(dash,w-p),3,c);fill(x+p,y+h-3,std::min(dash,w-p),3,c);}
    for(int p=0;p<h;p+=dash*2){fill(x,y+p,3,std::min(dash,h-p),c);fill(x+w-3,y+p,3,std::min(dash,h-p),c);}
}
void button(int x,int y,int w,int h,const std::string& label,bool hot=false) {
    bevel(x,y,w,h,hot?Color{170,135,25,255}:Color{30,70,119,255},true);
    centerText(label,x+w/2,y+(h-14)/2,2,hot?Color{255,241,135,255}:white);
}

struct Stop {
    const char* suburb; const char* address; const char* note; const char* safeName;
    float zx,zy; int reason,pickup; float wind; bool rain;
};
const std::array<Stop,5> route{{
    {"QUIET CRESCENT","17 WATTLEBIRD WAY","NO ANSWER. SIGNATURE REQUIRED.","FRONT PORCH",1188,624,0,0,0.00f,false},
    {"WINDY COURT","4/2 GUMTREE LANE","GUSTY! PARCEL MUST STAY DRY.","LETTERBOX",1094,845,1,1,0.38f,false},
    {"UNIT BLOCK","UNIT 3, 88 CREEK RD","FRONT DOOR LOCKED. SIGNATURE ITEM.","DOORSTEP",1180,616,2,2,-0.14f,false},
    {"RAINY AFTERNOON","9 MAGPIE PARADE","NO ANSWER. USE A SAFE PLACE.","UNDER AWNING",1120,588,0,0,0.12f,true},
    {"LAST RUN","2 KOOKABURRA CRT","LAST PARCEL. THE DOG KNOWS.","FRONT PORCH",1188,624,1,1,-0.30f,true}
}};
const char* reasonOptions[] = {"NO ANSWER","UNSAFE TO LEAVE","SIGNATURE REQUIRED"};
const char* pickupOptions[] = {"KOOKABURRA LPO","RIVERSIDE PARCEL LOCKER","CENTRAL DEPOT"};

enum class Phase { Welcome, Aim, Flight, Card, Escape, Between, Summary };
Phase phase=Phase::Welcome;
int stopIndex=0, totalScore=0, runScore=0, deliveries=0, cleanCards=0, caughtCount=0;
float shiftSeconds=82.0f, stopSeconds=22.0f, detection=0.12f;
float charge=0.0f, flightT=0.0f, flightDuration=0.95f, escapeProgress=0.0f;
float targetX=1188,targetY=624, resultQuality=0.0f, messageTimer=0.0f;
int cardReason=0, cardPickup=0, cardField=0, mistakes=0;
bool charging=false, pointerCharging=false, parcelSafe=false, cardAccurate=false, cleanEscape=true, showingMap=false;
std::string statusMessage="DELIVERING A BRIGHTER TOMORROW (PROBABLY)";
float animation=0;

void beginStop() {
    phase=Phase::Aim; stopSeconds=22.0f; charge=0; charging=false; pointerCharging=false; flightT=0;
    const Stop&s=route[stopIndex]; targetX=s.zx; targetY=s.zy;
    cardReason=0; cardPickup=0; cardField=0; mistakes=0; escapeProgress=0; cleanEscape=true;
    statusMessage=std::string("ROUTE ")+std::to_string(stopIndex+1)+" / "+s.suburb;
}
void startShift() {
    stopIndex=0; totalScore=0; runScore=0; deliveries=0; cleanCards=0; caughtCount=0;
    shiftSeconds=82.0f; detection=0.12f; showingMap=false; beginStop();
}
void beginCard() {
    phase=Phase::Card; cardReason=0; cardPickup=0; cardField=0;
    statusMessage="CARD UP! A FORM IS JUST A SMALLER ENVELOPE.";
}
void launchParcel() {
    if(phase!=Phase::Aim) return;
    charging=false; phase=Phase::Flight; flightT=0;
    float d=std::hypot(targetX-THROW_X,targetY-THROW_Y);
    flightDuration=std::clamp(d/690.0f,0.70f,1.55f);
    statusMessage="AIRBORNE. PLEASE DO NOT WRITE 'FRAGILE' ON THE DOG.";
}
void landParcel() {
    const Stop&s=route[stopIndex];
    float d=std::hypot(targetX-s.zx,targetY-s.zy);
    float chargePenalty=std::abs(charge-0.66f);
    // The clear target ring is forgiving; power rewards a well-timed release.
    parcelSafe=(d<75.0f && chargePenalty<0.27f);
    resultQuality=std::clamp(1.0f-d/190.0f-chargePenalty*0.75f,0.0f,1.0f);
    if(d>120 && std::hypot(targetX-918,targetY-773)<125) {
        statusMessage="THE DOG HAS OPINIONS ABOUT YOUR DELIVERY.";
        detection=std::min(1.0f,detection+0.22f);
    } else if(parcelSafe) statusMessage="THUMP! A PERFECTLY UNOFFICIAL SAFE PLACE.";
    else statusMessage="MISSED THE MARK. PAPERWORK WILL HEAR ABOUT THIS.";
    if(parcelSafe) deliveries++;
    beginCard();
}
void stampCard(bool timedOut=false) {
    if(phase!=Phase::Card) return;
    const Stop&s=route[stopIndex];
    cardAccurate=!timedOut && cardReason==s.reason && cardPickup==s.pickup;
    if(cardAccurate) cleanCards++;
    else { mistakes++; detection=std::min(1.0f,detection+0.12f); }
    statusMessage=cardAccurate?"KA-CHUNK! THE PAPERWORK IS LEGALLY LEGIBLE.":"STAMPED. PROBABLY GOING TO THE WRONG POST OFFICE.";
    phase=Phase::Escape; escapeProgress=0; cleanEscape=true;
}
void finishStop() {
    int pts=55;
    if(parcelSafe) pts+=120+(int)(resultQuality*60);
    else pts-=35;
    if(cardAccurate) pts+=90; else pts-=40;
    if(cleanEscape) pts+=70;
    if(stopSeconds>12) pts+=40;
    else if(stopSeconds<4) pts-=20;
    pts=std::max(0,pts);
    runScore=pts; totalScore+=pts;
    phase=Phase::Between;
    statusMessage="STOP COMPLETE. NOBODY WAS HARMED. ONLY THE SCORE.";
}
void nextStop() {
    if(stopIndex+1<(int)route.size() && shiftSeconds>0) {
        ++stopIndex; beginStop();
    } else { phase=Phase::Summary; statusMessage="SHIFT COMPLETE. FILE YOUR OWN COMPLAINT."; }
}
void targetClamp(){targetX=std::clamp(targetX,(float)WORLD_X+24,(float)(WORLD_X+WORLD_W-24));targetY=std::clamp(targetY,(float)WORLD_Y+24,(float)(WORLD_Y+WORLD_H-24));}

void drawBird(int x,int y,int s,Color c) {
    // Tiny kookaburra silhouette, assembled from intentionally chunky pixels.
    fill(x+3*s,y+2*s,6*s,3*s,c); fill(x+1*s,y+4*s,8*s,4*s,c);
    fill(x+4*s,y+7*s,4*s,3*s,c); fill(x+7*s,y+3*s,6*s,2*s,Color{237,185,101,255});
    fill(x+6*s,y+1*s,2*s,2*s,Color{251,251,238,255});
    fill(x+7*s,y+1*s,s,s,Color{15,23,34,255});
    fill(x+3*s,y+10*s,2*s,s,c); fill(x+8*s,y+10*s,2*s,s,c);
}
void drawDesktop() {
    fill(0,0,W,H,Color{26,65,113,255});
    // Early-90s brushed desktop, faint tile and grain.
    for(int y=56;y<H;y+=40) line(0,y,W,y,Color{30,73,123,255});
    for(int x=120;x<W;x+=48) line(x,56,x,H,Color{28,69,118,255});
    fill(0,0,W,54,Color{38,88,149,255});
    fill(0,51,W,3,Color{111,160,213,255});
    drawBird(16,8,3,Color{10,25,45,255});
    text("KOOKABURRA OS 97",142,13,4,Color{7,21,40,255});
    text("SMALL COUNTRY. BIG IDEAS.",800,21,2,Color{177,211,241,255});
    fill(1127,0,321,52,Color{75,123,181,255});
    outline(1128,1,318,50,Color{146,188,226,255});
    text("WED 14 MAY 1997   10:24 AM",1140,17,2,Color{12,28,48,255});
    // Desktop app icons in the blue rail.
    struct Icon {const char* label; Color body; int kind;};
    const Icon icons[]={{"MY STUFF",{91,169,224,255},0},{"LETTERS",{249,202,98,255},1},
        {"AUSSIE NET",{67,178,106,255},2},{"NOTEPAD",{230,232,223,255},3},
        {"PIC VIEWER",{127,189,222,255},4},{"SETTINGS",{179,192,205,255},5},{"BIN",{170,179,189,255},6}};
    int yy=96;
    for(int i=0;i<7;i++) {
        int ix=31, iy=yy+i*111;
        if(i==0){drawBird(ix,iy,3,Color{238,243,238,255});fill(ix+38,iy+18,25,18,Color{245,248,242,255});outline(ix+38,iy+18,25,18,Color{14,34,58,255});}
        else if(i==1){bevel(ix,iy+7,58,38,icons[i].body,true);fill(ix+4,iy+4,18,8,Color{255,226,139,255});}
        else if(i==2){SDL_FRect r{(float)ix+8,(float)iy+2,43,43};color(Color{32,111,221,255});SDL_RenderFillRect(renderer,&r);outline(ix+8,iy+2,43,43,Color{21,43,75,255});fill(ix+15,iy+13,28,6,Color{102,204,255,255});}
        else if(i==3){bevel(ix+8,iy,42,49,Color{241,243,232,255},true);for(int k=0;k<4;k++)line(ix+15,iy+13+k*7,ix+43,iy+13+k*7,Color{73,99,125,255});}
        else if(i==4){bevel(ix,iy+1,59,40,Color{220,230,232,255},true);fill(ix+4,iy+5,51,30,Color{63,138,190,255});fill(ix+6,iy+27,48,8,Color{92,153,73,255});}
        else if(i==5){SDL_FRect r{(float)ix+6,(float)iy+1,45,45};color(Color{164,184,204,255});SDL_RenderFillRect(renderer,&r);outline(ix+6,iy+1,45,45,Color{31,48,66,255});for(int k=0;k<8;k++)line(ix+18,iy+4+k*5,ix+39,iy+4+k*5,Color{61,83,105,255});}
        else {bevel(ix+12,iy,35,48,Color{184,194,200,255},true);fill(ix+16,iy+8,27,34,Color{123,143,154,255});}
        centerText(icons[i].label,60,iy+59,1,white);
    }
    // The framed program window.
    bevel(121,59,1312,1015,Color{30,75,130,255},true);
    fill(130,68,1294,35,Color{56,106,169,255});
    drawBird(138,73,2,Color{19,37,60,255});
    text("AUSPOST SIMULATOR: DELIVERY ATTEMPT",198,77,3,Color{9,25,48,255});
    text("_",1350,74,3,white); outline(1346,70,33,28,Color{152,193,229,255});
    text("X",1393,76,3,white); outline(1387,70,33,28,Color{152,193,229,255});
    // App footer/status bar.
    fill(132,1030,1298,37,Color{45,92,151,255});
    fill(132,1030,1298,2,Color{145,185,223,255});
    bevel(143,1037,31,23,Color{218,234,244,255},true);
    text("+",150,1041,2,Color{23,48,76,255});
    text(statusMessage,194,1042,2,white);
    drawBird(1248,1038,2,Color{16,31,51,255});
    text("KOOKABURRA OS 97",1290,1042,2,Color{13,30,51,255});
}
void drawPanel(int x,int y,int w,int h,const char* title) {
    bevel(x,y,w,h,Color{5,19,37,255},true);
    text(title,x+12,y+12,2,Color{181,214,243,255});
}
void drawRouteMap(int x,int y,int w,int h) {
    fill(x,y,w,h,Color{11,35,61,255});
    // Suburb map is a hand-drawn road atlas, not a generic minimap widget.
    line(x+7,y+h-14,x+w*.35f,y+8,Color{69,110,150,255});
    line(x+w*.27f,y+h-3,x+w*.6f,y+5,Color{69,110,150,255});
    line(x+w*.55f,y+h-10,x+w*.34f,y+h*.48f,Color{52,93,133,255});
    line(x+w*.58f,y+h*.45f,x+w-6,y+h*.16f,Color{69,110,150,255});
    line(x+w*.08f,y+h*.63f,x+w*.88f,y+h*.79f,Color{48,86,126,255});
    line(x+w*.14f,y+h*.2f,x+w*.74f,y+h*.46f,Color{48,86,126,255});
    for(int i=0;i<5;i++) {
        int px=x+22+(i*47)%std::max(50,w-42), py=y+20+(i*31)%(std::max(42,h-42));
        Color c=i==stopIndex?gold:(i<stopIndex?green:red);
        fill(px-4,py-4,9,9,c); fill(px-1,py-1,3,3,Color{255,255,255,255});
    }
    fill(x+w-27,y+8,17,12,Color{66,141,74,255});
    text("N",x+w-19,y+20,1,white);
}
void drawHud() {
    drawPanel(134,114,300,136,"LEAVE CARD BEFORE CAUGHT");
    text("1. AIM FOR THE DROP",154,150,2,gold);
    text("2. FILL OUT CARD",178,180,2,white);
    text("3. ESCAPE TO YOUR BIKE",178,210,2,white);
    if(phase==Phase::Aim) fill(146,151,5,18,gold);
    else if(phase==Phase::Card) fill(169,181,5,17,gold);
    else if(phase==Phase::Escape) fill(169,211,5,17,gold);

    drawPanel(443,114,260,136,"PARCEL YEET-O-METER");
    int gx=459, gy=168, gw=229, gh=32;
    // segmented green -> amber -> danger charge meter
    for(int i=0;i<20;i++) {
        Color c=i<9?Color{69,191,122,255}:i<14?Color{236,196,55,255}:Color{219,73,65,255};
        fill(gx+i*11,gy,9,gh,c);
        fill(gx+i*11,gy+gh-4,9,4,Color{18,33,50,255});
    }
    int pointer=gx+(int)(std::clamp(charge,0.0f,1.0f)*gw);
    fill(pointer-3,gy-7,6,gh+13,white);
    text(phase==Phase::Aim?(charging?"RELEASE IN THE GOLD": "HOLD SPACE TO CHARGE"):
         phase==Phase::Flight?"BOX IS IN THE AIR": phase==Phase::Card?"PAPERWORK INCOMING":
         phase==Phase::Escape?"RUN, POSTIE, RUN": "SHIFT IN PROGRESS",469,211,1,lightBlue);

    drawPanel(711,114,145,136,"TIME LEFT");
    char timebuf[24]; std::snprintf(timebuf,sizeof timebuf,"%02d:%02d",std::max(0,(int)shiftSeconds)/60,std::max(0,(int)shiftSeconds)%60);
    centerText(timebuf,783,159,5,shiftSeconds<14?red:Color{255,86,77,255});
    centerText("SHIFT CLOCK",783,220,1,lightBlue);

    drawPanel(865,114,160,136,"CARD: BLANK");
    bevel(891,153,111,72,Color{233,232,217,255},true);
    for(int i=0;i<4;i++)line(902,166+i*12,989-(i%2)*18,166+i*12,Color{53,82,117,255});
    fill(900,211,8,8,Color{68,88,111,255});
    if(phase==Phase::Card)fill(974,158,16,16,red);

    drawPanel(1030,114,168,136,"DOOR: QUIET");
    // A tiny door visual with an animated rattle when detection is high.
    int shake=detection>.72f?(int)(std::sin(animation*35)*4):0;
    fill(1072+shake,153,65,82,Color{88,113,149,255});
    outline(1072+shake,153,65,82,Color{176,195,218,255});
    fill(1082+shake,164,43,67,Color{37,59,91,255});
    fill(1117+shake,190,5,5,Color{255,210,74,255});
    if(detection>.58f){text("!",1150,155,3,red);text("!",1164,175,2,red);}
    text(detection>.75f?"SOMEONE'S UP":"LISTENING...",1043,222,1,detection>.75f?red:lightBlue);

    drawPanel(1204,114,222,136,"ROUTE");
    text(std::string("0")+std::to_string(stopIndex+1),1317,125,3,gold);
    drawRouteMap(1215,153,198,83);
    text((std::to_string(std::max(0,(int)route.size()-deliveries))+" LEFT").c_str(),1218,237,2,white);
}
void drawTarget() {
    const Stop&s=route[stopIndex];
    // A painted parcel target floats over the actual garden art; the dashed edge makes it legible.
    int zx=(int)s.zx,zy=(int)s.zy;
    Color c=gold;
    if(s.safeName==std::string("LETTERBOX")) c=Color{101,221,245,255};
    dashedRect(zx-47,zy-25,94,50,c,8);
    centerText(s.safeName,zx,zy-47,1,Color{255,250,183,255});
    if(phase==Phase::Aim) {
        float arc=80.0f+charge*130.0f;
        for(int i=0;i<24;i++) {
            float t=i/23.0f;
            float xx=THROW_X+(targetX-THROW_X)*t+route[stopIndex].wind*65*t;
            float yy=THROW_Y+(targetY-THROW_Y)*t-std::sin(PI*t)*arc;
            if(i%2==0)fill(xx-3,yy-3,6,6,Color{254,241,175,210});
        }
        // reticle
        int tx=(int)targetX,ty=(int)targetY;
        line(tx-16,ty,tx-5,ty,white);line(tx+5,ty,tx+16,ty,white);
        line(tx,ty-16,tx,ty-5,white);line(tx,ty+5,tx,ty+16,white);
        outline(tx-4,ty-4,8,8,gold);
    }
}
void drawParcel(float x,float y,float scale=1.0f) {
    fill(x-14*scale,y+13*scale,31*scale,5*scale,Color{20,27,28,95});
    fill(x-12*scale,y-10*scale,25*scale,22*scale,Color{169,111,56,255});
    fill(x-12*scale,y-10*scale,25*scale,4*scale,Color{220,162,90,255});
    fill(x-2*scale,y-10*scale,5*scale,22*scale,Color{207,67,50,255});
    fill(x+4*scale,y-8*scale,7*scale,7*scale,Color{239,233,202,255});
    outline(x-12*scale,y-10*scale,25*scale,22*scale,Color{74,45,31,255});
}
void drawWorldFx() {
    const Stop&s=route[stopIndex];
    if(s.wind!=0) {
        for(int i=0;i<8;i++) {
            float xx=std::fmod(animation*160+i*179.0f,1300.0f)+WORLD_X;
            float yy=WORLD_Y+340+(i*73)%360;
            line(xx,yy,xx+32+std::abs(s.wind)*60,yy-8,Color{214,237,178,135});
        }
    }
    if(s.rain) {
        for(int i=0;i<55;i++) {
            float xx=WORLD_X+std::fmod(i*181.0f+animation*280.0f,WORLD_W);
            float yy=WORLD_Y+std::fmod(i*97.0f+animation*420.0f,WORLD_H);
            line(xx,yy,xx-7,yy+17,Color{194,222,250,90});
        }
        fill(WORLD_X,WORLD_Y,WORLD_W,WORLD_H,Color{48,68,108,27});
    }
    // Alarm sparks at the door and cheeky dog bark pips.
    if(detection>0.46f) {
        int n=(int)(animation*4)%3;
        text("!",1180+n*8,565-n*4,2,red);
    }
    if(phase==Phase::Flight) {
        float t=std::clamp(flightT/flightDuration,0.0f,1.0f);
        float arc=80.0f+charge*130.0f;
        float x=THROW_X+(targetX-THROW_X)*t+route[stopIndex].wind*65*t;
        float y=THROW_Y+(targetY-THROW_Y)*t-std::sin(PI*t)*arc;
        for(int i=0;i<5;i++)fill(x-i*12,y+i*3,5,5,Color{254,228,137,(Uint8)(190-i*28)});
        drawParcel(x,y,0.82f+0.18f*std::sin(t*PI));
    }
}

void drawWorld() {
    if(yard) {SDL_FRect dst{(float)WORLD_X,(float)WORLD_Y,(float)WORLD_W,(float)WORLD_H};SDL_RenderTexture(renderer,yard,nullptr,&dst);}
    else fill(WORLD_X,WORLD_Y,WORLD_W,WORLD_H,Color{67,126,68,255});
    drawWorldFx();
    if(phase==Phase::Aim) drawTarget();
}
void drawWelcome() {
    fill(WORLD_X,WORLD_Y,WORLD_W,WORLD_H,Color{3,12,25,125});
    bevel(372,394,705,325,Color{8,26,49,244},true);
    drawBird(678,424,4,Color{242,243,226,255});
    centerText("AUSPOST SIMULATOR",724,505,6,Color{244,239,217,255});
    centerText("DELIVERY ATTEMPT",724,552,4,Color{255,224,67,255});
    centerText("SMALL COUNTRY. VERY LARGE PAPERWORK.",724,600,2,Color{188,215,239,255});
    button(524,650,400,62,"START YOUR SHIFT",true);
    centerText("SPACE THROW  /  MOUSE AIM  /  ARROWS ESCAPE",724,742,1,white);
}
void drawCard() {
    // Paper form with cream stock, blue rules, stamp and route-office eccentricities.
    bevel(380,328,690,570,Color{9,22,40,248},true);
    fill(396,344,658,538,Color{239,235,214,255});
    fill(396,344,658,48,Color{37,75,119,255});
    drawBird(411,351,2,Color{236,241,226,255});
    text("FORM 97-B  /  DELIVERY ATTEMPT",458,360,2,white);
    text("POSTIE'S COPY",868,361,1,Color{191,216,238,255});
    text("YOU MISSED",424,413,4,Color{20,47,77,255});
    text(route[stopIndex].address,424,451,2,Color{44,68,91,255});
    text(route[stopIndex].note,424,481,1,Color{87,95,94,255});
    line(420,503,1018,503,Color{145,165,177,255});
    text("01   REASON FOR CARD",424,520,2,Color{37,72,106,255});
    for(int i=0;i<3;i++) {
        int yy=548+i*35;
        if(cardReason==i)fill(414,yy-4,612,29,Color{255,224,73,115});
        outline(430,yy,15,15,Color{55,84,108,255});
        if(cardReason==i)fill(434,yy+4,7,7,Color{35,88,137,255});
        text(std::string(1,char('A'+i))+"  "+reasonOptions[i],460,yy+1,2,Color{35,52,68,255});
    }
    text("02   COLLECT FROM",424,663,2,Color{37,72,106,255});
    for(int i=0;i<3;i++) {
        int yy=692+i*35;
        if(cardPickup==i)fill(414,yy-4,612,29,Color{255,224,73,115});
        outline(430,yy,15,15,Color{55,84,108,255});
        if(cardPickup==i)fill(434,yy+4,7,7,Color{35,88,137,255});
        text(std::string(1,char('A'+i))+"  "+pickupOptions[i],460,yy+1,2,Color{35,52,68,255});
    }
    // Print-time deadline, punch-stamp, and form paper clip.
    text("PRESENT THIS CARD WITH PHOTO ID",424,807,1,Color{96,102,101,255});
    bevel(835,819,179,43,Color{164,55,47,255},true);
    centerText(cardField==2?"ENTER: STAMP":"ENTER: NEXT",924,834,1,white);
    text("CARD TIMER",420,852,1,Color{81,92,96,255});
    fill(505,852,470,10,Color{184,194,187,255});
    fill(505,852,470*std::clamp(stopSeconds/13.0f,0.0f,1.0f),10,
         stopSeconds<6?red:Color{58,157,119,255});
}
void drawMapOverlay() {
    fill(130,106,1300,902,Color{5,13,28,225});
    bevel(330,274,790,632,Color{19,45,76,255},true);
    text("SHIFT ROUTE / 03",380,319,3,Color{255,228,92,255});
    text("FIVE STOPS. ONE BICYCLE. QUESTIONABLE INSURANCE.",380,356,1,lightBlue);
    for(int i=0;i<5;i++) {
        int y=404+i*88;
        Color c=i<stopIndex?green:i==stopIndex?gold:muted;
        fill(381,y,687,69,Color{9,24,44,255}); outline(381,y,687,69,Color{65,104,145,255});
        fill(399,y+21,26,26,c);
        text(std::to_string(i+1),407,y+27,1,ink);
        text(route[i].suburb,447,y+13,2,white);
        text(route[i].address,447,y+42,1,lightBlue);
        text(i<stopIndex?"DONE":i==stopIndex?"NEXT":"WAITING",932,y+28,1,c);
    }
    centerText("TAB TO CLOSE",724,824,1,white);
}
void drawBetween() {
    fill(WORLD_X,WORLD_Y,WORLD_W,WORLD_H,Color{5,14,25,115});
    bevel(424,430,600,245,Color{8,28,51,245},true);
    centerText(parcelSafe?"PARCEL: SAFELY YEETED":"PARCEL: NEEDS A BETTER POSTIE",724,470,3,parcelSafe?green:orange);
    centerText(cardAccurate?"CARD: ACCURATE ENOUGH FOR THE UNION":"CARD: THE LPO IS ON THE WRONG SIDE",724,514,1,white);
    centerText(cleanEscape?"GETAWAY: ABSOLUTELY NO EYE CONTACT":"GETAWAY: RESIDENT SAW THE SHORTS",724,547,1,white);
    char b[80];std::snprintf(b,sizeof b,"STOP SCORE   +%d      TOTAL   %d",runScore,totalScore);
    centerText(b,724,585,2,gold);
    button(555,624,338,44,stopIndex+1==(int)route.size()?"FILE THE SHIFT":"NEXT DELIVERY",true);
}
void drawSummary() {
    fill(WORLD_X,WORLD_Y,WORLD_W,WORLD_H,Color{4,13,29,216});
    bevel(336,288,775,697,Color{12,37,67,250},true);
    centerText("SHIFT COMPLETE",724,333,5,Color{255,231,93,255});
    centerText("KOOKABURRA DISTRICT / ROUTE 03",724,390,1,lightBlue);
    char b[80];std::snprintf(b,sizeof b,"%06d POINTS",totalScore);
    centerText(b,724,437,4,white);
    int medalCount=std::clamp(totalScore/360,0,3);
    for(int i=0;i<3;i++) {
        int x=610+i*89; Color c=i<medalCount?gold:Color{75,91,108,255};
        fill(x,508,52,52,c); outline(x,508,52,52,Color{231,242,239,255});
        centerText(i==0?"S":i==1?"A":"F",x+26,529,2,Color{33,47,58,255});
    }
    centerText("DELIVERIES",528,584,1,muted);
    centerText((std::to_string(deliveries)+" / 5").c_str(),528,607,2,white);
    centerText("CLEAN CARDS",724,584,1,muted);
    centerText((std::to_string(cleanCards)+" / 5").c_str(),724,607,2,white);
    centerText("PAPERWORK",920,584,1,muted);
    centerText(caughtCount==0?"NO WITNESSES":"WITNESSES: "+std::to_string(caughtCount),920,607,1,white);
    button(520,690,408,54,"RUN THE ROUTE AGAIN",true);
    centerText("HAPPY POST, QUIET DOGS, NO CLAIMS (PROBABLY)",724,777,1,lightBlue);
}
void drawAimCaption() {
    if(phase!=Phase::Aim) return;
    fill(428,949,708,42,Color{7,22,39,205});
    centerText("AIM FOR THE MARK  /  HOLD SPACE OR TOUCH THE GOLD BUTTON",782,963,1,white);
    button(1190,944,190,48,charging?"RELEASE TO YEET":"HOLD TO YEET",true);
    // Small wind arrow helps turn the level note into something actionable.
    float wind=route[stopIndex].wind;
    if(std::abs(wind)>0.05f) {
        int ax=1320, ay=918; line(ax,ay,ax+(wind>0?54:-54),ay-15,Color{255,239,156,255});
        line(ax+(wind>0?54:-54),ay-15,ax+(wind>0?41:-41),ay-16,Color{255,239,156,255});
        centerText("WIND",ax,ay+8,1,white);
    }
}
void draw() {
    SDL_SetRenderDrawColor(renderer,16,43,76,255); SDL_RenderClear(renderer);
    drawDesktop(); drawWorld(); drawHud(); drawAimCaption();
    if(phase==Phase::Welcome)drawWelcome();
    if(phase==Phase::Card)drawCard();
    if(phase==Phase::Between)drawBetween();
    if(phase==Phase::Summary)drawSummary();
    if(showingMap)drawMapOverlay();
    SDL_RenderPresent(renderer);
}

void chooseCard(int x,int y) {
    if(y>=540&&y<653){cardReason=std::clamp((y-544)/35,0,2);cardField=1;}
    else if(y>=681&&y<795){cardPickup=std::clamp((y-688)/35,0,2);cardField=2;}
    else if(x>=820&&y>=805&&y<870)stampCard();
}
void update(float dt) {
    animation+=dt;
    if(messageTimer>0)messageTimer=std::max(0.0f,messageTimer-dt);
    if(phase==Phase::Welcome||phase==Phase::Summary)return;
    shiftSeconds-=dt;
    stopSeconds-=dt;
    if(shiftSeconds<=0 && phase!=Phase::Summary) { phase=Phase::Summary; statusMessage="SHIFT CLOCK HIT ZERO. THE OFFICE HAS NOTICED."; return; }
    if(phase==Phase::Aim) {
        if(charging)charge=std::min(1.0f,charge+dt*0.59f);
        detection=std::min(1.0f,detection+dt*(0.006f+std::abs(route[stopIndex].wind)*0.008f));
        if(stopSeconds<=0){statusMessage="TOO SLOW. THE FORM HAS BECOME SENTIENT.";beginCard();}
    } else if(phase==Phase::Flight) {
        flightT+=dt;
        if(flightT>=flightDuration)landParcel();
    } else if(phase==Phase::Card) {
        detection=std::min(1.0f,detection+dt*0.024f);
        if(stopSeconds<=0){stampCard(true);statusMessage="THE FORM TIMED OUT. SOMEHOW IT'S STILL PAPER.";}
    } else if(phase==Phase::Escape) {
        float movement=(SDL_GetKeyboardState(nullptr)[SDL_SCANCODE_LEFT]||SDL_GetKeyboardState(nullptr)[SDL_SCANCODE_A])?1.55f:0.68f;
        bool sprint=SDL_GetKeyboardState(nullptr)[SDL_SCANCODE_LSHIFT]||SDL_GetKeyboardState(nullptr)[SDL_SCANCODE_RSHIFT];
        escapeProgress=std::min(1.0f,escapeProgress+dt*movement*(sprint?1.8f:1.0f));
        detection=std::max(0.08f,detection-dt*(sprint?0.009f:0.002f));
        if(detection>=0.98f){cleanEscape=false;caughtCount++;statusMessage="CAUGHT. APOLOGISE, CYCLE BACK, LOSE 20 SECONDS.";shiftSeconds=std::max(0.0f,shiftSeconds-5.0f);detection=0.55f;escapeProgress=1.0f;}
        if(escapeProgress>=1.0f)finishStop();
    } else if(phase==Phase::Between) {
        // allow a short breather while the next route card slides in
    }
}
void screenshotIfRequested() {
    if(capturePath.empty())return;
    SDL_Surface* s=SDL_RenderReadPixels(renderer,nullptr);
    if(s){SDL_SaveBMP(s,capturePath.c_str());SDL_DestroySurface(s);}
    capturePath.clear();
    quitRequested=true;
}
void frame() {
    Uint64 now=SDL_GetTicks();
    float dt=previousTicks?std::clamp((now-previousTicks)/1000.0f,0.0f,0.04f):0.016f;
    previousTicks=now;
    SDL_Event ev;
    while(SDL_PollEvent(&ev)) {
        if(ev.type==SDL_EVENT_QUIT)quitRequested=true;
        if(ev.type==SDL_EVENT_KEY_DOWN&&!ev.key.repeat) {
            SDL_Keycode k=ev.key.key; SDL_Scancode sc=ev.key.scancode;
            if(k==SDLK_TAB){showingMap=!showingMap;}
            else if(sc==SDL_SCANCODE_R){startShift();}
            else if(k==SDLK_ESCAPE){if(showingMap)showingMap=false;else if(phase!=Phase::Welcome)phase=Phase::Welcome;}
            else if(k==SDLK_RETURN||k==SDLK_KP_ENTER) {
                if(phase==Phase::Welcome)startShift();
                else if(phase==Phase::Card){if(cardField<2)cardField++;else stampCard();}
                else if(phase==Phase::Between)nextStop();
                else if(phase==Phase::Summary)startShift();
            } else if(k==SDLK_SPACE&&phase==Phase::Aim) {charging=true;}
            else if(phase==Phase::Aim&&(k==SDLK_LEFT||sc==SDL_SCANCODE_A))targetX-=24;
            else if(phase==Phase::Aim&&(k==SDLK_RIGHT||sc==SDL_SCANCODE_D))targetX+=24;
            else if(phase==Phase::Aim&&(k==SDLK_UP||sc==SDL_SCANCODE_W))targetY-=24;
            else if(phase==Phase::Aim&&(k==SDLK_DOWN||sc==SDL_SCANCODE_S))targetY+=24;
            else if(phase==Phase::Card) {
                if(k==SDLK_LEFT||sc==SDL_SCANCODE_A) {if(cardField==0)cardReason=(cardReason+2)%3;else if(cardField==1)cardPickup=(cardPickup+2)%3;}
                if(k==SDLK_RIGHT||sc==SDL_SCANCODE_D) {if(cardField==0)cardReason=(cardReason+1)%3;else if(cardField==1)cardPickup=(cardPickup+1)%3;}
                if(k==SDLK_1||k==SDLK_2||k==SDLK_3) {
                    int v=(int)(k-SDLK_1);if(cardField==0)cardReason=v;else if(cardField==1)cardPickup=v;
                }
            }
        }
        if(ev.type==SDL_EVENT_KEY_UP&&ev.key.key==SDLK_SPACE&&phase==Phase::Aim)launchParcel();
        if(ev.type==SDL_EVENT_MOUSE_MOTION||ev.type==SDL_EVENT_MOUSE_BUTTON_DOWN||ev.type==SDL_EVENT_MOUSE_BUTTON_UP) {
            SDL_Event e=ev; SDL_ConvertEventToRenderCoordinates(renderer,&e);
            if(e.type==SDL_EVENT_MOUSE_MOTION) {
                if(phase==Phase::Aim && !(e.motion.x>=1190&&e.motion.x<=1380&&e.motion.y>=944&&e.motion.y<=992)){targetX=e.motion.x;targetY=e.motion.y;targetClamp();}
            } else if(e.type==SDL_EVENT_MOUSE_BUTTON_DOWN&&e.button.button==SDL_BUTTON_LEFT) {
                int mx=(int)e.button.x,my=(int)e.button.y;
                if(phase==Phase::Aim&&mx>=1190&&mx<=1380&&my>=944&&my<=992){charging=true;pointerCharging=true;charge=0;}
            } else if(e.type==SDL_EVENT_MOUSE_BUTTON_UP&&e.button.button==SDL_BUTTON_LEFT) {
                int mx=(int)e.button.x,my=(int)e.button.y;
                if(pointerCharging){pointerCharging=false;launchParcel();}
                else if(phase==Phase::Welcome&&mx>510&&mx<938&&my>640&&my<730)startShift();
                else if(phase==Phase::Card)chooseCard(mx,my);
                else if(phase==Phase::Between&&mx>540&&mx<910&&my>615&&my<680)nextStop();
                else if(phase==Phase::Summary&&mx>510&&mx<940&&my>680&&my<750)startShift();
                else if(phase==Phase::Aim&&!(mx>=1190&&mx<=1380&&my>=944&&my<=992)){targetX=mx;targetY=my;targetClamp();}
            }
        }
        if(ev.type==SDL_EVENT_FINGER_MOTION||ev.type==SDL_EVENT_FINGER_DOWN||ev.type==SDL_EVENT_FINGER_UP) {
            float fx=ev.tfinger.x*W, fy=ev.tfinger.y*H;
            if(ev.type==SDL_EVENT_FINGER_MOTION) {
                if(phase==Phase::Aim&&!(fx>=1190&&fx<=1380&&fy>=944&&fy<=992)){targetX=fx;targetY=fy;targetClamp();}
            } else if(ev.type==SDL_EVENT_FINGER_DOWN&&phase==Phase::Aim&&fx>=1190&&fx<=1380&&fy>=944&&fy<=992) {
                charging=true;pointerCharging=true;charge=0;
            } else if(ev.type==SDL_EVENT_FINGER_UP&&pointerCharging) {
                pointerCharging=false;launchParcel();
            }
        }
    }
    targetClamp();
    update(dt);
    draw();
    screenshotIfRequested();
#ifdef __EMSCRIPTEN__
    if(quitRequested)emscripten_cancel_main_loop();
#endif
}
}

int main(int argc,char**argv) {
    for(int i=1;i<argc;i++)if(std::strcmp(argv[i],"--screenshot")==0&&i+1<argc)capturePath=argv[++i];
    if(!SDL_Init(SDL_INIT_VIDEO|SDL_INIT_EVENTS)) {std::fprintf(stderr,"SDL_Init: %s\n",SDL_GetError());return 1;}
    window=SDL_CreateWindow("AusPost Simulator — Kookaburra OS 97",W,H,SDL_WINDOW_RESIZABLE|SDL_WINDOW_HIGH_PIXEL_DENSITY);
    if(!window){std::fprintf(stderr,"SDL_CreateWindow: %s\n",SDL_GetError());SDL_Quit();return 1;}
    renderer=SDL_CreateRenderer(window,nullptr);
    if(!renderer){std::fprintf(stderr,"SDL_CreateRenderer: %s\n",SDL_GetError());SDL_DestroyWindow(window);SDL_Quit();return 1;}
    SDL_SetRenderLogicalPresentation(renderer,W,H,SDL_LOGICAL_PRESENTATION_LETTERBOX);
    SDL_SetRenderVSync(renderer,1);
    SDL_SetRenderDrawBlendMode(renderer,SDL_BLENDMODE_BLEND);
    SDL_Surface* bmp=SDL_LoadBMP("assets/yard.bmp");
    if(bmp){yard=SDL_CreateTextureFromSurface(renderer,bmp);SDL_DestroySurface(bmp);if(yard)SDL_SetTextureScaleMode(yard,SDL_SCALEMODE_NEAREST);}
    else std::fprintf(stderr,"yard image missing: %s\n",SDL_GetError());
    previousTicks=SDL_GetTicks();
#ifdef __EMSCRIPTEN__
    emscripten_set_main_loop(frame,0,1);
#else
    while(!quitRequested)frame();
#endif
    if(yard)SDL_DestroyTexture(yard);
    SDL_DestroyRenderer(renderer); SDL_DestroyWindow(window); SDL_Quit();
    return 0;
}

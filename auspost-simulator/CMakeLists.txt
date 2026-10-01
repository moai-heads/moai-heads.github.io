cmake_minimum_required(VERSION 3.20)
project(auspost_simulator LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_executable(auspost src/main.cpp)
target_compile_options(auspost PRIVATE -Wall -Wextra -Wpedantic)

if(EMSCRIPTEN)
    # SDL's own Emscripten guide recommends using SDL as a CMake subproject.
    include(FetchContent)
    set(SDL_SHARED OFF CACHE BOOL "" FORCE)
    set(SDL_STATIC ON CACHE BOOL "" FORCE)
    set(SDL_TESTS OFF CACHE BOOL "" FORCE)
    set(SDL_EXAMPLES OFF CACHE BOOL "" FORCE)
    FetchContent_Declare(SDL3
        URL https://github.com/libsdl-org/SDL/archive/refs/tags/release-3.4.16.tar.gz
        DOWNLOAD_EXTRACT_TIMESTAMP TRUE
    )
    FetchContent_MakeAvailable(SDL3)
    target_link_libraries(auspost PRIVATE SDL3::SDL3)
    set_target_properties(auspost PROPERTIES SUFFIX ".js")
    target_link_options(auspost PRIVATE
        "-sALLOW_MEMORY_GROWTH=1"
        "-sMAX_WEBGL_VERSION=2"
        "-sMIN_WEBGL_VERSION=2"
        "--preload-file" "${CMAKE_CURRENT_SOURCE_DIR}/assets/yard.bmp@/assets/yard.bmp"
    )
else()
    find_package(SDL3 CONFIG REQUIRED)
    target_link_libraries(auspost PRIVATE SDL3::SDL3)
    file(MAKE_DIRECTORY "${CMAKE_BINARY_DIR}/assets")
    configure_file(assets/yard.bmp "${CMAKE_BINARY_DIR}/assets/yard.bmp" COPYONLY)
endif()

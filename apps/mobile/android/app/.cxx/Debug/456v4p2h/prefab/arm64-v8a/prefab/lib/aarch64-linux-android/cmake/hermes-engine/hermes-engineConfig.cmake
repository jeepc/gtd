if(NOT TARGET hermes-engine::hermesvm)
add_library(hermes-engine::hermesvm SHARED IMPORTED)
set_target_properties(hermes-engine::hermesvm PROPERTIES
    IMPORTED_LOCATION "C:/Users/chenke/scoop/persist/gradle/.gradle/caches/9.0.0/transforms/9d34929fdb65a145dc091d62c15d0d86/transformed/hermes-android-250829098.0.9-debug/prefab/modules/hermesvm/libs/android.arm64-v8a/libhermesvm.so"
    INTERFACE_INCLUDE_DIRECTORIES "C:/Users/chenke/scoop/persist/gradle/.gradle/caches/9.0.0/transforms/9d34929fdb65a145dc091d62c15d0d86/transformed/hermes-android-250829098.0.9-debug/prefab/modules/hermesvm/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()


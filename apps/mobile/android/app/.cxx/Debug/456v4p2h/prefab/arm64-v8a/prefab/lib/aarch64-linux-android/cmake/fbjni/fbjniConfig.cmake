if(NOT TARGET fbjni::fbjni)
add_library(fbjni::fbjni SHARED IMPORTED)
set_target_properties(fbjni::fbjni PROPERTIES
    IMPORTED_LOCATION "C:/Users/chenke/scoop/persist/gradle/.gradle/caches/9.0.0/transforms/6cb94eb4240b26bae55579cb79d8f81a/transformed/fbjni-0.7.0/prefab/modules/fbjni/libs/android.arm64-v8a/libfbjni.so"
    INTERFACE_INCLUDE_DIRECTORIES "C:/Users/chenke/scoop/persist/gradle/.gradle/caches/9.0.0/transforms/6cb94eb4240b26bae55579cb79d8f81a/transformed/fbjni-0.7.0/prefab/modules/fbjni/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()


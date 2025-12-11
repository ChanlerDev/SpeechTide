{
  "targets": [
    {
      "target_name": "ax_insert",
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ],
      "cflags!": [
        "-fno-exceptions"
      ],
      "cflags_cc!": [
        "-fno-exceptions"
      ],
      "sources": [
        "src/ax-insert.cpp",
        "src/ax-insert.h"
      ],
      "include_dirs": [
        "<!@(node -p \"require('path').dirname(require.resolve('node-addon-api/package.json'))\")"
      ],
      "link_settings": {
        "libraries": [
          "-framework Cocoa",
          "-framework ApplicationServices",
          "-framework Carbon"
        ]
      },
      "conditions": [
        ['OS=="mac"', {
          "xcode_settings": {
            "GCC_ENABLE_OBJC_GC": "unsupported",
            "MACOSX_DEPLOYMENT_TARGET": "10.14",
            "GCC_PREPROCESSOR_DEFINITIONS": [
              "__MAC_OS_X_VERSION_MIN_REQUIRED=101400"
            ],
            "CLANG_CXX_LIBRARY": "libc++",
            "CLANG_CXXFLAGS": [
              "-std=c++11",
              "-fexceptions"
            ],
            "CLANG_WARN_EMPTY_BODY": "YES",
            "CLANG_WARN_CONSTANT_CONVERSION": "YES",
            "CLANG_WARN_DEPRECATED_OBJC_IMPLEMENTATIONS": "YES",
            "CLANG_WARN_DIRECT_OBJC_ISA_USAGE": "YES_ERROR",
            "CLANG_WARN_DOCUMENTATION_COMMENTS": "YES",
            "CLANG_WARN_EMPTY_BODY": "YES",
            "CLANG_WARN_ENUM_CONVERSION": "YES",
            "CLANG_WARN_INFINITE_RECURSION": "YES",
            "CLANG_WARN_INT_CONVERSION": "YES",
            "CLANG_WARN_NON_LITERAL_NULL_CONVERSION": "YES",
            "CLANG_WARN_OBJC_IMPLICIT_RETAIN_SELF": "YES",
            "CLANG_WARN_OBJC_LITERAL_CONVERSION": "YES",
            "CLANG_WARN_OBJC_ROOT_CLASS": "YES_ERROR",
            "CLANG_WARN_QUOTED_INCLUDE_IN_FRAMEWORK_HEADER": "YES",
            "CLANG_WARN_RANGE_LOOP_ANALYSIS": "YES",
            "CLANG_WARN_STRICT_PROTOTYPES": "YES",
            "CLANG_WARN_SUSPICIOUS_MOVE": "YES",
            "CLANG_WARN_UNREACHABLE_CODE": "YES",
            "CLANG_WARN__DUPLICATE_METHOD_MATCH": "YES"
          }
        }]
      ]
    }
  ]
}
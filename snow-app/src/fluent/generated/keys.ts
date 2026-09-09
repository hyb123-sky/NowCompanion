import "@servicenow/sdk/global";

declare global {
    namespace Now {
        namespace Internal {
            interface Keys extends KeysRegistry {
                explicit: {
                        "role.user": {
                            "table": "sys_user_role",
                            "id": "3c0d5fa0f8d54e8a845a8b681e385278"
                        },
                        "role.admin": {
                            "table": "sys_user_role",
                            "id": "9010a0d1bce74b708550042b331c6d63"
                        },
                        "role.integration": {
                            "table": "sys_user_role",
                            "id": "59bc29d9d82f4c469d89578048219cab"
                        },
                        "package_json": {
                            "table": "sys_module",
                            "id": "2c3c0799cc0249bd85227e28b7fd7211"
                        }
                    };
            }
        }
    }
}

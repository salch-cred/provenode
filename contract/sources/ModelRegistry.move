module provenode_addr::ModelRegistry {

    use std::signer;
    use std::string::{Self, String};
    use std::vector;
    use aptos_framework::timestamp;
    use aptos_framework::event::{Self, EventHandle};
    use aptos_framework::account;

    // ── Structs ─────────────────────────────────────────────────
    struct ModelRecord has store, drop, copy {
        id:               vector<u8>,     // UUID bytes
        sha256:           vector<u8>,     // 32-byte SHA-256
        shelby_object_id: String,
        model_name:       String,
        org_address:      address,
        registered_at:    u64,            // microseconds
        version:          String,
        signed:           bool,
    }

    struct ModelRegistry has key {
        models:           vector<ModelRecord>,
        model_registered: EventHandle<ModelRegisteredEvent>,
    }

    struct ModelRegisteredEvent has drop, store {
        sha256:      vector<u8>,
        model_name:  String,
        org_address: address,
        timestamp:   u64,
    }

    // ── Errors ───────────────────────────────────────────────────
    const E_NOT_INITIALIZED: u64 = 1;
    const E_ALREADY_INITIALIZED: u64 = 2;
    const E_DUPLICATE_SHA256: u64 = 3;
    const E_NOT_FOUND: u64 = 4;

    // ── Initialize ───────────────────────────────────────────────
    public entry fun initialize(account: &signer) {
        let addr = signer::address_of(account);
        assert!(!exists<ModelRegistry>(addr), E_ALREADY_INITIALIZED);
        move_to(account, ModelRegistry {
            models: vector::empty(),
            model_registered: account::new_event_handle<ModelRegisteredEvent>(account),
        });
    }

    // ── Register a model ─────────────────────────────────────────
    public entry fun register_model(
        account:          &signer,
        sha256:           vector<u8>,
        shelby_object_id: vector<u8>,
        model_name:       vector<u8>,
        version:          vector<u8>,
        id:               vector<u8>,
    ) acquires ModelRegistry {
        let addr = signer::address_of(account);
        assert!(exists<ModelRegistry>(addr), E_NOT_INITIALIZED);

        let registry = borrow_global_mut<ModelRegistry>(addr);

        // Check for duplicate SHA-256
        let i = 0;
        while (i < vector::length(&registry.models)) {
            let existing = vector::borrow(&registry.models, i);
            assert!(existing.sha256 != sha256, E_DUPLICATE_SHA256);
            i = i + 1;
        };

        let now = timestamp::now_microseconds();
        let record = ModelRecord {
            id,
            sha256,
            shelby_object_id: string::utf8(shelby_object_id),
            model_name: string::utf8(model_name),
            org_address: addr,
            registered_at: now,
            version: string::utf8(version),
            signed: false,
        };

        vector::push_back(&mut registry.models, record);

        event::emit_event(&mut registry.model_registered, ModelRegisteredEvent {
            sha256,
            model_name: string::utf8(model_name),
            org_address: addr,
            timestamp: now,
        });
    }

    // ── Verify model by SHA-256 ───────────────────────────────────
    #[view]
    public fun verify_model(
        registry_address: address,
        sha256:           vector<u8>,
    ): bool acquires ModelRegistry {
        if (!exists<ModelRegistry>(registry_address)) return false;
        let registry = borrow_global<ModelRegistry>(registry_address);
        let i = 0;
        while (i < vector::length(&registry.models)) {
            if (vector::borrow(&registry.models, i).sha256 == sha256) return true;
            i = i + 1;
        };
        false
    }

    // ── Get model count ───────────────────────────────────────────
    #[view]
    public fun model_count(registry_address: address): u64 acquires ModelRegistry {
        if (!exists<ModelRegistry>(registry_address)) return 0;
        vector::length(&borrow_global<ModelRegistry>(registry_address).models)
    }
}

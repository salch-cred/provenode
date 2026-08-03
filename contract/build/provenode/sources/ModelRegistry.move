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
        deactivated:      bool,           // FIX H-2: revocation support
    }

    // ── #10 Dataset Registry ─────────────────────────────────────────────
    struct DatasetRecord has store, drop, copy {
        id:           vector<u8>,    // 16-byte ID
        name:         String,
        merkle_root:  vector<u8>,    // Merkle root of all shard SHA-256s
        shard_count:  u64,
        total_bytes:  u64,
        license:      String,
        source:       String,
        registered_at: u64,
    }

    // ── #5 Provenance Node ───────────────────────────────────────────────
    struct ProvenanceNode has store, drop, copy {
        child_model_id:  vector<u8>,
        parent_model_id: vector<u8>,  // empty = origin
        dataset_ids:     vector<vector<u8>>,
        operation:       String,      // "fine-tune" | "distill" | "merge"
        node_hash:       vector<u8>,
        timestamp:       u64,
    }

    // ── #6 Incident Record (Self-Healing) ────────────────────────────────
    struct IncidentRecord has store, drop, copy {
        id:              vector<u8>,
        device_id:       String,
        model_id:        vector<u8>,
        old_sha256:      vector<u8>,
        new_sha256:      vector<u8>,
        tamper_detected_at: u64,
        healed_at:       u64,
        autonomous:      bool,
    }

    struct ModelRegistry has key {
        models:             vector<ModelRecord>,
        datasets:           vector<DatasetRecord>,    // #10
        provenance:         vector<ProvenanceNode>,   // #5
        incidents:          vector<IncidentRecord>,   // #6
        model_registered:   EventHandle<ModelRegisteredEvent>,
        model_signed:       EventHandle<ModelSignedEvent>,
        model_deactivated:  EventHandle<ModelDeactivatedEvent>,
        dataset_registered: EventHandle<DatasetRegisteredEvent>,  // #10
        incident_logged:    EventHandle<IncidentLoggedEvent>,     // #6
    }

    struct ModelRegisteredEvent has drop, store {
        sha256:      vector<u8>,
        model_name:  String,
        org_address: address,
        timestamp:   u64,
    }

    // FIX H-2 & H-3: Events for sign and deactivate operations
    struct ModelSignedEvent has drop, store {
        sha256:    vector<u8>,
        signed_at: u64,
    }

    struct ModelDeactivatedEvent has drop, store {
        sha256:         vector<u8>,
        deactivated_at: u64,
    }

    struct DatasetRegisteredEvent has drop, store {
        dataset_id:  vector<u8>,
        merkle_root: vector<u8>,
        name:        String,
        timestamp:   u64,
    }

    struct IncidentLoggedEvent has drop, store {
        incident_id: vector<u8>,
        device_id:   String,
        model_id:    vector<u8>,
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
            models:             vector::empty(),
            datasets:           vector::empty(),
            provenance:         vector::empty(),
            incidents:          vector::empty(),
            model_registered:   account::new_event_handle<ModelRegisteredEvent>(account),
            model_signed:       account::new_event_handle<ModelSignedEvent>(account),
            model_deactivated:  account::new_event_handle<ModelDeactivatedEvent>(account),
            dataset_registered: account::new_event_handle<DatasetRegisteredEvent>(account),
            incident_logged:    account::new_event_handle<IncidentLoggedEvent>(account),
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
            deactivated: false,  // FIX H-2
        };

        vector::push_back(&mut registry.models, record);

        event::emit_event(&mut registry.model_registered, ModelRegisteredEvent {
            sha256,
            model_name: string::utf8(model_name),
            org_address: addr,
            timestamp: now,
        });
    }

    // ── Mark model as signed (FIX H-3) ───────────────────────────────────
    public entry fun mark_signed(
        account: &signer,
        sha256:  vector<u8>,
    ) acquires ModelRegistry {
        let addr = signer::address_of(account);
        assert!(exists<ModelRegistry>(addr), E_NOT_INITIALIZED);
        let registry = borrow_global_mut<ModelRegistry>(addr);
        let i = 0;
        let found = false;
        while (i < vector::length(&registry.models)) {
            let record = vector::borrow_mut(&mut registry.models, i);
            if (record.sha256 == sha256) {
                record.signed = true;
                found = true;
                break
            };
            i = i + 1;
        };
        assert!(found, E_NOT_FOUND);
        let now = timestamp::now_microseconds();
        event::emit_event(&mut registry.model_signed, ModelSignedEvent {
            sha256, signed_at: now,
        });
    }

    // ── Deactivate (revoke) a model (FIX H-2) ────────────────────────────
    public entry fun deactivate_model(
        account: &signer,
        sha256:  vector<u8>,
    ) acquires ModelRegistry {
        let addr = signer::address_of(account);
        assert!(exists<ModelRegistry>(addr), E_NOT_INITIALIZED);
        let registry = borrow_global_mut<ModelRegistry>(addr);
        let i = 0;
        let found = false;
        while (i < vector::length(&registry.models)) {
            let record = vector::borrow_mut(&mut registry.models, i);
            if (record.sha256 == sha256) {
                record.deactivated = true;
                found = true;
                break
            };
            i = i + 1;
        };
        assert!(found, E_NOT_FOUND);
        let now = timestamp::now_microseconds();
        event::emit_event(&mut registry.model_deactivated, ModelDeactivatedEvent {
            sha256, deactivated_at: now,
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
    // ── Register a dataset (#10) ──────────────────────────────────────────
    public entry fun register_dataset(
        account:     &signer,
        id:          vector<u8>,
        name:        vector<u8>,
        merkle_root: vector<u8>,
        shard_count: u64,
        total_bytes: u64,
        license:     vector<u8>,
        source:      vector<u8>,
    ) acquires ModelRegistry {
        let addr = signer::address_of(account);
        assert!(exists<ModelRegistry>(addr), E_NOT_INITIALIZED);
        let registry = borrow_global_mut<ModelRegistry>(addr);
        let now = timestamp::now_microseconds();
        let record = DatasetRecord {
            id,
            name: string::utf8(name),
            merkle_root,
            shard_count,
            total_bytes,
            license: string::utf8(license),
            source: string::utf8(source),
            registered_at: now,
        };
        vector::push_back(&mut registry.datasets, record);
        event::emit_event(&mut registry.dataset_registered, DatasetRegisteredEvent {
            dataset_id: id,
            merkle_root,
            name: string::utf8(name),
            timestamp: now,
        });
    }

    // ── Log provenance node (#5) ──────────────────────────────────────────
    public entry fun log_provenance(
        account:         &signer,
        child_model_id:  vector<u8>,
        parent_model_id: vector<u8>,
        operation:       vector<u8>,
        node_hash:       vector<u8>,
    ) acquires ModelRegistry {
        let addr = signer::address_of(account);
        assert!(exists<ModelRegistry>(addr), E_NOT_INITIALIZED);
        let registry = borrow_global_mut<ModelRegistry>(addr);
        let node = ProvenanceNode {
            child_model_id,
            parent_model_id,
            dataset_ids: vector::empty(),
            operation: string::utf8(operation),
            node_hash,
            timestamp: timestamp::now_microseconds(),
        };
        vector::push_back(&mut registry.provenance, node);
    }

    // ── Log self-heal incident (#6) ───────────────────────────────────────
    public entry fun log_incident(
        account:    &signer,
        id:         vector<u8>,
        device_id:  vector<u8>,
        model_id:   vector<u8>,
        old_sha256: vector<u8>,
        new_sha256: vector<u8>,
    ) acquires ModelRegistry {
        let addr = signer::address_of(account);
        assert!(exists<ModelRegistry>(addr), E_NOT_INITIALIZED);
        let registry = borrow_global_mut<ModelRegistry>(addr);
        let now = timestamp::now_microseconds();
        let record = IncidentRecord {
            id,
            device_id: string::utf8(device_id),
            model_id,
            old_sha256,
            new_sha256,
            tamper_detected_at: now,
            healed_at: 0,
            autonomous: true,
        };
        vector::push_back(&mut registry.incidents, record);
        event::emit_event(&mut registry.incident_logged, IncidentLoggedEvent {
            incident_id: id,
            device_id: string::utf8(device_id),
            model_id,
            timestamp: now,
        });
    }

    // ── Dataset count view (#10) ──────────────────────────────────────────
    #[view]
    public fun dataset_count(registry_address: address): u64 acquires ModelRegistry {
        if (!exists<ModelRegistry>(registry_address)) return 0;
        vector::length(&borrow_global<ModelRegistry>(registry_address).datasets)
    }

    // ── Incident count view (#6) ──────────────────────────────────────────
    #[view]
    public fun incident_count(registry_address: address): u64 acquires ModelRegistry {
        if (!exists<ModelRegistry>(registry_address)) return 0;
        vector::length(&borrow_global<ModelRegistry>(registry_address).incidents)
    }


}

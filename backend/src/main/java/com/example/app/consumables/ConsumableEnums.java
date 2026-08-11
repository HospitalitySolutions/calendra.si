package com.example.app.consumables;

public final class ConsumableEnums {
    private ConsumableEnums() {}

    public enum QuantityMode {
        PER_SESSION,
        PER_PARTICIPANT
    }

    public enum StockMovementType {
        PURCHASE,
        SESSION_USAGE,
        MANUAL_ADJUSTMENT,
        RETURN,
        WASTE,
        CORRECTION,
        INVENTORY_COUNT,
        TRANSFER_OUT,
        TRANSFER_IN
    }

    public enum StockMovementSourceType {
        MANUAL,
        PURCHASE_ORDER,
        SESSION,
        INVENTORY_COUNT,
        TRANSFER
    }

    public enum PurchaseOrderStatus {
        DRAFT,
        ORDERED,
        PARTIALLY_RECEIVED,
        COMPLETED,
        CANCELLED
    }

    public enum SupplierStatus {
        ACTIVE,
        INACTIVE
    }

    public enum InventorySessionStatus {
        IN_PROGRESS,
        COMPLETED
    }
}

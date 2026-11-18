// Placeholder catalogue. Replace with live Apigee Management API calls.
export const resources = {
  targets: ["shipment-backend", "payment-backend", "customer-backend"],
  products: ["customer-product", "payment-product", "shipment-product"],
  developers: [
    "platform-team@example.com",
    "mobile-partner@example.com",
    "logistics@example.com",
  ],
  apps: ["customer-mobile-app", "partner-portal-app", "shipment-partner-app"],
  sharedFlows: {
    dev: ["SF-Common-Logging", "SF-Correlation-ID", "SF-Centralized-Error-Handling", "SF-Security-Headers", "SF-Request-Validation"],
    test: ["SF-Common-Logging", "SF-Correlation-ID", "SF-Centralized-Error-Handling", "SF-Security-Headers"],
    stage: ["SF-Common-Logging", "SF-Correlation-ID", "SF-Security-Headers"],
    prod: ["SF-Common-Logging", "SF-Correlation-ID", "SF-Centralized-Error-Handling"],
  } as Record<string, string[]>,
};

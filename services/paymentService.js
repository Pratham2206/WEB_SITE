class PaymentService {
    constructor(gateway) {
        this.gateway = gateway; // The specific gateway implementation
    }

    async createOrder(options) {
        return this.gateway.createOrder(options);
    }

    verifySignature(data) {
        return this.gateway.verifySignature(data);
    }
}

module.exports = PaymentService;

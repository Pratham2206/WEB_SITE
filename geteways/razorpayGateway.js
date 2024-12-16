const crypto = require('crypto');

class RazorpayGateway {
    constructor(razorpayInstance) {
        this.razorpay = razorpayInstance; // The Razorpay SDK instance
    }

    async createOrder(options) {
        return this.razorpay.orders.create(options);
    }

    verifySignature({ order_id, payment_id, signature }) {
        const shasum = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
        shasum.update(`${order_id}|${payment_id}`);
        return shasum.digest('hex') === signature;
    }
}

module.exports = RazorpayGateway;

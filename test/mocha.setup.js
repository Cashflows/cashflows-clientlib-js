const axios = require('axios');
const MockAdapter = require("axios-mock-adapter");

before(function() {
    this.mock = new MockAdapter(axios);
    this.mock
        .onGet("api/gateway/payment-intents/valid-token-mock").reply(200, {
            data: { token: 'valid-token-mock', 'paymentStatus': 'Pending' }
        })
        .onGet("api/gateway/payment-intents/invalid-token-mock").reply(404)
		.onPost("api/gateway/payment-intents/valid-token-mock/payments").reply(config => {
			return [ 200, { data: { paymentStatus: 'Paid', requestData: JSON.parse(config.data) } } ];
		})
		.onGet("api/gateway/payment-intents/valid-token-mock/stored-cards").reply(config => {
			return [ 200, { data: [ { maskedCardNumber: '**** **** **** 1234', cardExpiryMonth: 1, cardExpiryYear: 23, encryptedCardData: 'AAAA' } ] } ];
		})
        .onAny().reply(404);
});

after(function() {
    this.mock.restore();
});

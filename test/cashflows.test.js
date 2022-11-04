const assert = require('assert');
const axios = require('axios');
const MockAdapter = require("axios-mock-adapter");

const Cashflows = require('../dist/cashflows-clientlib.js').Cashflows;

var mock = new MockAdapter(axios);

mock
	.onGet("api/gateway/payment-intents/valid-token-mock").reply(200, {
		data: { token: 'valid-token-mock', 'paymentStatus': 'Pending' }
	})
	.onGet("api/gateway/payment-intents/invalid-token-mock").reply(404)
	.onAny().reply(404);

describe('Cashflows', () => {
	it('valid payment intent', function() {
		let cashflows = new Cashflows('valid-token-mock', true);
		return cashflows.getPaymentIntent()
			.then(responseData => {
				assert.ok(responseData.token == 'valid-token-mock', 'should return intent with token');
			})
	});

	it('invalid payment intent', function() {
		let cashflows = new Cashflows('invalid-token-mock', true);
		return cashflows.getPaymentIntent()
			.then(() => {
				assert.false('should not resolve');
			})
			.catch(error => {
				assert.ok(error == 'Invalid payment intent.', 'should throw')
			})
	});
});    

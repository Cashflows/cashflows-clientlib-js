require('./mocha.setup.js');

const assert = require('assert');
const axios = require('axios');
const MockAdapter = require("axios-mock-adapter");

const Cashflows = require('../dist/cashflows-clientlib.js').Cashflows;

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

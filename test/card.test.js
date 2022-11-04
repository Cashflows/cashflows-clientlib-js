const assert = require('assert');
const axios = require('axios');
const MockAdapter = require("axios-mock-adapter");
const Cashflows = require('../dist/cashflows-clientlib.js').Cashflows;
const { validate: uuidValidate } = require('uuid');

var mock = new MockAdapter(axios);

mock
	.onAny().reply(404);

before(function () {
	this.jsdom = require('jsdom-global')(`
		<!DOCTYPE html>
		<html>
			<body>
				<form id="card-live-form" method="post">
				<input id="card-number" />
				<input id="card-name" />
				<input id="card-expiration" />
				<input id="card-cvc" />
				<button type="submit" id="pay-with-card">
				</form>
			</body>
		</html>
	`);
});

after(function () {
	this.jsdom();
});

describe('Card', () => {
	it('initialise', function() {
		let cashflows = new Cashflows('valid-token-mock', true);
		return cashflows.initCard('#card-number', '#card-name', '#card-expiration', '#card-cvc', '#pay-with-card')
			.then(() => {
				var iframes = document.querySelectorAll('iframe');
				assert.equal(iframes.length, 4, 'should insert four iframes');

				var uuids = [...iframes]
					.filter(iframe => iframe.hasAttribute('data-uuid'))
					.map(iframe => iframe.getAttribute('data-uuid'))
					.filter(uuid => uuidValidate(uuid))
				assert.equal(uuids.length, 4, 'should have uuids assigned to all four iframes');

				assert.equal(uuids.filter(uuid => uuidValidate(uuid)).length, 4, 'should have four valid uuids');
			});
	});

});    

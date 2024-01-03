require('./mocha.setup.js');

const assert = require('assert');
const jsdom = require('jsdom-global');
const Cashflows = require('../dist/cashflows-clientlib.js').Cashflows;
const { validate: uuidValidate } = require('uuid');

describe('Card', function() {
	it('checkout', function() {
		var context = {};

		jsdom(`
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

		context.cashflows = new Cashflows('valid-token-mock', true);
		return context.cashflows.initCard('#card-number', '#card-name', '#card-expiration', '#card-cvc', '#pay-with-card')
			.then(() => {
				let iframes = document.querySelectorAll('iframe');
				assert.equal(iframes.length, 4, 'should insert four iframes');

				context.uuids = [...iframes]
					.filter(iframe => iframe.hasAttribute('data-uuid'))
					.map(iframe => iframe.getAttribute('data-uuid'))
				assert.equal(context.uuids.length, 4, 'should have uuids assigned to all four iframes');

				assert.equal(context.uuids.filter(uuid => uuidValidate(uuid)).length, 4, 'should have four valid uuids');
			})
			.then(() => new Promise((resolve, reject) => {
				context.cashflows.checkout()
					.then(response => {
						assert.equal(response.paymentStatus, 'Paid', 'should result in paid status');
						assert.deepEqual(response.requestData.preparationIds, context.uuids, 'should pass the generated uuids');
						resolve();
					})
					.catch(error => reject(error));

				var button = document.querySelector('#pay-with-card');
				button.removeAttribute('disabled', ''); // otherwise the click won't work
				button.click();
			}))
	});

	it('checkout with stored cards', function() {
		var context = {};

		jsdom(`
			<!DOCTYPE html>
			<html>
				<body>
					<div id="stored-card-list"></div>
					<form id="card-live-form" method="post">
					<input id="card-number" />
					<input id="card-name" />
					<input id="card-expiration" />
					<input id="card-cvc" />
					<input type="checkbox" id="store-card-details" />
					<button type="submit" id="pay-with-card">
					</form>
				</body>
			</html>
		`);

		context.cashflows = new Cashflows('valid-token-mock', true);
		return context.cashflows.initCard('#card-number', '#card-name', '#card-expiration', '#card-cvc', '#pay-with-card', '#store-card-details', '#stored-card-list')
			.then(() => {
				let iframes = document.querySelectorAll('iframe');
				context.uuids = [...iframes]
					.filter(iframe => iframe.hasAttribute('data-uuid'))
					.map(iframe => iframe.getAttribute('data-uuid'))
			})
			.then(() => new Promise((resolve, reject) => {
				context.cashflows.checkout()
					.then(response => {
						assert.equal(response.paymentStatus, 'Paid', 'should result in paid status');
						assert.deepEqual(response.requestData.preparationIds, context.uuids, 'should pass the generated uuids');
						resolve();
					})
					.catch(error => reject(error));

				setTimeout(() => {
					var button = document.querySelector('#pay-with-card');
					button.removeAttribute('disabled', ''); // otherwise the click won't work
					button.click();
				}, 500);
			}))
	});
});    

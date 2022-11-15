require('./mocha.setup.js');

const assert = require('assert');
const Cashflows = require('../dist/cashflows-clientlib.js').Cashflows;
const { validate: uuidValidate } = require('uuid');

describe('Card', function() {
	it('initialise', function() {
		var self = this;
		self.cashflows = new Cashflows('valid-token-mock', true);
		return self.cashflows.initCard('#card-number', '#card-name', '#card-expiration', '#card-cvc', '#pay-with-card')
			.then(() => {
				var iframes = document.querySelectorAll('iframe');
				assert.equal(iframes.length, 4, 'should insert four iframes');

				self.uuids = [...iframes]
					.filter(iframe => iframe.hasAttribute('data-uuid'))
					.map(iframe => iframe.getAttribute('data-uuid'))
				assert.equal(self.uuids.length, 4, 'should have uuids assigned to all four iframes');

				assert.equal(self.uuids.filter(uuid => uuidValidate(uuid)).length, 4, 'should have four valid uuids');
			});
	});

	it('checkout', function() {
		var self = this;
		return new Promise((resolve, reject) => {
			self.cashflows.checkout()
				.then(response => {
					assert.equal(response.paymentStatus, 'Paid', 'should result in paid status');
					assert.deepEqual(response.requestData.preparationIds, self.uuids, 'should pass the generated uuids');
					resolve();
				})
				.catch(error => reject(error));
			
			var button = document.querySelector('#pay-with-card');
			button.removeAttribute('disabled', ''); // otherwise the click won't work
			button.click();
		});
	});
});    

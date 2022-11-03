const assert = require('assert');
const Cashflows = require('../dist/cashflows-clientlib.js').Cashflows;

describe('Cashflows', () => {
	it('should be properly initialized', function(done) {
		let cashflows = new Cashflows('invalid-token', true);
		return cashflows.checkout()
			.then(() => {
				assert.ok(true, 'should always succeed');
				done();
			});
	});

    it('should be able to reach cashflows api', function() {
		assert.ok(true, 'should always succeed');
		// TBC
	});
});    

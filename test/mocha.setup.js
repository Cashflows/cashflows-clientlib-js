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
        .onAny().reply(404);

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

after(function() {
    this.mock.restore();

	this.jsdom();
});

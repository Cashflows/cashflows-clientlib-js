const CASHFLOWS_CLASSNAME_PREFIX = 'cf-';
const CASHFLOWS_INTEGRATION_ENDPOINT = 'https://gateway-devf.cashflows.com/';
const CASHFLOWS_PRODUCTION_ENDPOINT = 'https://gateway.cashflows.com/';

export function Cashflows(intentToken, isIntegration) {
	var self = this;

	self._intentToken = intentToken;
	self._isIntegration = isIntegration;

	self._endpoint = self._isIntegration ? CASHFLOWS_INTEGRATION_ENDPOINT : CASHFLOWS_PRODUCTION_ENDPOINT;

	self._preparationIds = {};
	self._cardElements = null;
	self._applePayElements = null;
	self._googlePayElements = null;
	self._payPalElements = null;

	self._checkoutPromise = null; // also indicates a checkout has started

	 // Public methods.

	self.initCard = (cardNumberEl, cardNameEl, cardExpiryEl, cardCvcEl, buttonEl) => {
		return new Promise((resolve, reject) => {
			try {
				var cardElements = {};

				cardElements.cardnumber = cardNumberEl instanceof HTMLInputElement ? cardNumberEl : document.querySelector(cardNumberEl);
				cardElements.cardholdername = cardNameEl instanceof HTMLInputElement ? cardNameEl : document.querySelector(cardNameEl);
				cardElements.cardexpiry = cardExpiryEl instanceof HTMLInputElement ? cardExpiryEl : document.querySelector(cardExpiryEl);
				cardElements.cardcvc = cardCvcEl instanceof HTMLInputElement ? cardCvcEl : document.querySelector(cardCvcEl);

				if (Object.keys(cardElements).filter(key => !(cardElements[key] instanceof HTMLInputElement)).length > 0) {
					reject('Invalid element(s): ' + elements.join(','));
					return;
				}

				Object.keys(cardElements).forEach(key => {
					var element = cardElements[key];

					// Create iframe.
					var iframe = document.createElement("iframe");
					var uuid = self._generateUuid();
					iframe.setAttribute('frameborder', '0');
					iframe.setAttribute('scrolling', 'no');
					iframe.setAttribute('allowtransparency', 'true');

					iframe.setAttribute('src', self._endpoint + 'payment/preparation/' + uuid + '?inputtype=' + key);
					[CASHFLOWS_CLASSNAME_PREFIX + 'card', CASHFLOWS_CLASSNAME_PREFIX + key].forEach(className => iframe.classList.add(className));

					// Style iframe.
					const styles = window.getComputedStyle(element);
					let cssText = styles.cssText;
					if (!cssText) {
						cssText = Array.from(styles).reduce((str, property) => {
							return `${str}${property}: ${styles.getPropertyValue(property)};`;
						}, '');
					}
					iframe.style.cssText = cssText;

					// Style iframe alternative.
					// var width = element.offsetWidth.toString() + 'px';
					// var height = element.offsetHeight.toString() + 'px';
					// iframe.setAttribute('style', 'width:' + width + ';height:' + height + ';');
					// iframe.style.width = width;
					// iframe.style.height = height;

					// Replace input field with iframe.
					element.parentNode.insertBefore(iframe, element);
					element.parentNode.removeChild(element);

					self._preparationIds[uuid] = {
						iframe: iframe,
						valid: false
					}
				});

				cardElements.cardSubmit = buttonEl instanceof HTMLInputElement ? buttonEl : document.querySelector(buttonEl);
				if (!cardElements.cardSubmit) {
					reject('Invalid button: ' + buttonEl);
					return;
				}

				cardElements.cardSubmit.setAttribute('disabled', '');
				cardElements.cardSubmit.addEventListener('click', event => {
					event.preventDefault();

					if (self._checkoutPromise) {
						cardElements.cardSubmit.setAttribute('disabled', '');
		
						self._apiRequest('post', 'payment-intents/' + self._intentToken + '/payments', {
							'preparationIds': Object.keys(self._preparationIds)
						}).then(data => {
							try {
								self._openActionLink(data.links.action.url);
							}
							catch(_) {
								self._checkoutPromise.reject('Invalid response.');
							}
						})
						.catch(error => self._checkoutPromise.reject(error.message));
					}
				}, true);

				window.addEventListener("message", event => {
					if (event.data.event == 'validate') {
						var preparation = self._preparationIds[event.data.preparationId];
						if (preparation) {
							preparation.valid = event.data.valid;

							var iframe = preparation.iframe;
							if (!event.data.valid) {
								iframe.classList.add(CASHFLOWS_CLASSNAME_PREFIX + 'error');
								var span = preparation.span;
								if (!span) {
									span = document.createElement('span');
									span.classList.add(CASHFLOWS_CLASSNAME_PREFIX + 'message');
								}
								span.innerHTML = event.data.message;
								iframe.parentNode.insertBefore(span, iframe.nextSibling);
								preparation.span = span;
							}
							else {
								iframe.classList.remove(CASHFLOWS_CLASSNAME_PREFIX + 'error');
								if (preparation.span) {
									iframe.parentNode.removeChild(preparation.span);
								}
								preparation.span = undefined;
							}
						}

						var allValid = Object.keys(self._preparationIds).every(preparationId => self._preparationIds[preparationId].valid);
						if (allValid) {
							cardElements.cardSubmit.removeAttribute('disabled');
						}
						else {
							cardElements.cardSubmit.setAttribute('disabled', '');
						}
					}
				});

				self._cardElements = cardElements;

				resolve();
			}
			catch(_) {
				reject('An unexpected error occured.');
			}
		});
	};

	self.initApplePay = (buttonEl) => {
		console.warn('ApplePay is not yet supported');
		return new Promise((resolve, reject) => {
			resolve();
		});
		/*
		return new Promise((resolve, reject) => {
			if (!window.ApplePaySession) {
				reject('ApplePay not available on this device.');
			}

			return ApplePaySession.canMakePaymentsWithActiveCard('a');
		});
		*/
	};

	self.initGooglePay = (buttonEl) => {
		// https://developers.google.com/pay/api/web/guides/tutorial#supported-card-networks
		return new Promise((resolve, reject) => {
			try {
				var googlePayElements = {};

				googlePayElements.googlePaySubmit = buttonEl instanceof HTMLElement ? buttonEl : document.querySelector(buttonEl);
				if (!googlePayElements.googlePaySubmit) {
					reject('Invalid button: ' + buttonEl);
					return;
				}

				googlePayElements.googlePaySubmit.setAttribute('disabled', '');
				googlePayElements.googlePaySubmit.addEventListener('click', event => {
					event.preventDefault();

					self._googlePayElements.client.loadPaymentData(self._googlePayElements.paymentData)
						.then(paymentData => {
							self._apiRequest('post', 'payment-intents/' + self._intentToken + '/payments', {
								GooglePayTokenJson: paymentData.paymentMethodData.tokenizationData.token
							}).then(response => {
								if (response.data.paymentStatus == 'Paid') {
									self._checkoutPromise.resolve();
								}
								else {
									self._checkoutPromise.reject('Payment failed.');
								}
							})
							.catch(error => self._checkoutPromise.reject(error.message));
						});
				}, true);

				var loadScriptPromise = new Promise((resolve, reject) => {
					var script = document.createElement('script');
					script.onload = () => resolve();
					script.onerror = () => reject('Error while loading GooglePay javascript library.');
					script.src = 'https://pay.google.com/gp/p/js/pay.js';
					document.head.appendChild(script);
				});

				Promise.all([loadScriptPromise, self._paymentRequest('post', 'google-pay/get-payment-data-request?token=' + self._intentToken)])
					.then(result => {
						googlePayElements.client = new google.payments.api.PaymentsClient({environment: this.environment});
						googlePayElements.paymentData = result.pop();

						self._googlePayElements = googlePayElements;

						self._googlePayElements.client.isReadyToPay(self._googlePayElements.paymentData).then(response => {
							if (response.result) {
								self._googlePayElements.client.prefetchPaymentData(self._googlePayElements.paymentData);
								self._googlePayElements.googlePaySubmit.removeAttribute('disabled');
								resolve();
							}
						});
					});
			}
			catch(_) {
				reject('An unexpected error occured.');
			}
		});
	};

	self.checkout = () => {
		return new Promise((resolve, reject) => {
			self._getPaymentIntent(self._intentToken)
				.then(data => {
					if (data.paymentStatus != 'Pending') {
						reject('Invalid payment state: ' + data.paymentStatus);
						return;
					}

					self._checkoutPromise = { resolve: resolve, reject: reject };
					self._installUpdateEventsListener();
				})
				.catch(error => reject(error));
		});
	};

	// Private methods.

	self._installUpdateEventsListener = () => {
		window.addEventListener('message', (event) => {
			if (event.data.event == 'update') {
				self._getPaymentIntent(self._intentToken)
					.then(data => {
						if (data && data.paymentStatus) {
							if (data.paymentStatus != 'Pending') {
								self._challengeDialog.remove();
								if (data.paymentStatus == 'Paid') {
									self._checkoutPromise.resolve();
								}
								else {
									self._checkoutPromise.reject('Payment failed.');
								}
							}
						}
					})
					.catch(error => self._checkoutPromise.reject(error));
			}
		}, false);
	};

	self._openActionLink = (link) => {
		var backdrop = document.createElement("div");
		backdrop.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; overflow: none; z-index: 1; background-color: rgba(0,0,0,0.4);';

		var dialog = document.createElement("div");
		dialog.style.cssText = 'position: absolute;top: 50%; left: 50%; transform: translate(-50%, -50%); width: 40%; height: 70%; min-width: 450px; background: #fefefe; border: 1px solid black;';

		var iframe = document.createElement("iframe");
		iframe.setAttribute('frameborder', '0');
		iframe.setAttribute('scrolling', 'yes');
		iframe.setAttribute('allowtransparency', 'false');

		iframe.setAttribute('src', link);
		iframe.style.cssText = 'width: 100%; height: 100%;';

		dialog.appendChild(iframe);
		backdrop.appendChild(dialog);

		document.body.insertBefore(backdrop, document.body.firstChild);

		self._challengeDialog = backdrop;
	};

	self._apiRequest = (method, endpoint, data = {}) => {
		return new Promise((resolve, reject) => {
			let xhr = new XMLHttpRequest();

			xhr.open(method.toUpperCase(), self._endpoint + 'api/gateway/' + endpoint);
			xhr.setRequestHeader('Content-Type', 'application/json');

			xhr.onload = () => {
				var parsedResponse = {};
				try {
					parsedResponse = !!xhr.responseText ? JSON.parse(xhr.responseText) : {};
				}
				catch(_) { /* ignore */ }

				if (xhr.status >= 200 && xhr.status < 400) {
					resolve(parsedResponse);
				}
				else {
					try {
						reject({ status: xhr.status, message: parsedResponse.errorReport.errors[0].message });
					}
					catch(_) {
						reject({ status: xhr.status, message: 'Invalid response.'});
					}
				}
			}
	
			xhr.onerror = () => {
				reject({ status: 400, message: 'Communication failure.' });
			}

			xhr.send(JSON.stringify(data));
		});
	};

	self._paymentRequest = (method, endpoint, data = {}) => {
		return new Promise((resolve, reject) => {
			let xhr = new XMLHttpRequest();

			xhr.open(method.toUpperCase(), self._endpoint + 'payment/' + endpoint);
			xhr.setRequestHeader('Content-Type', 'application/json');

			xhr.onload = () => {
				var parsedResponse = {};
				try {
					parsedResponse = !!xhr.responseText ? JSON.parse(xhr.responseText) : {};
				}
				catch(_) { /* ignore */ }

				if (xhr.status >= 200 && xhr.status < 400) {
					resolve(parsedResponse);
				}
				else {
					try {
						reject({ status: xhr.status, message: parsedResponse.errorReport.errors[0].message });
					}
					catch(_) {
						reject({ status: xhr.status, message: 'Invalid response.'});
					}
				}
			}
	
			xhr.onerror = () => {
				reject({ status: 400, message: 'Communication failure.' });
			}

			xhr.send(JSON.stringify(data));
		});
	};

	self._getPaymentIntent = () => {
		return self._apiRequest('get', 'payment-intents/' + self._intentToken)
			.then(response => Promise.resolve(response.data))
			.catch(error => Promise.reject(error.status == 404 ? 'Invalid payment intent.' : error.message));
	};

	self._generateUuid = () => {
		var d = new Date().getTime(); // timestamp
		var d2 = ((typeof performance !== 'undefined') && performance.now && (performance.now()*1000)) || 0; // time in microseconds since page-load or 0 if unsupported
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
			var r = Math.random() * 16; // random number between 0 and 16
			if(d > 0){ // use timestamp until depleted
				r = (d + r)%16 | 0;
				d = Math.floor(d/16);
			} else { // use microseconds since page-load if supported
				r = (d2 + r)%16 | 0;
				d2 = Math.floor(d2/16);
			}
			return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
		});
	};
}

globalThis.Cashflows = Cashflows;
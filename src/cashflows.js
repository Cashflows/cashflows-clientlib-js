const CASHFLOWS_CLASSNAME_PREFIX = 'cf-';
const CASHFLOWS_INTEGRATION_ENDPOINT = 'https://gateway-int.cashflows.com/';
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

	self._checkoutPromiseSettlers = null; // also indicates a checkout has started

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

					if (self._checkoutPromiseSettlers) {
						cardElements.cardSubmit.setAttribute('disabled', '');
		
						var requestData = JSON.stringify({
							'preparationIds': Object.keys(self._preparationIds)
						});
						self._startPayment(requestData);
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

	// https://developer.apple.com/documentation/apple_pay_on_the_web/applepaysession/
	self.initApplePay = (targetEl) => {
		return new Promise((resolve, reject) => {
			try {
				// Silently fail if ApplePay is not available.
				if (!window.ApplePaySession || !ApplePaySession.canMakePayments()) {
					self._log('ApplePay not available on this device.');
					resolve();
					return;
				}

				var applePayElements = {};

				applePayElements.applePayEl = targetEl instanceof HTMLElement ? targetEl : document.querySelector(targetEl);
				if (!applePayElements.applePayEl) {
					reject('Invalid button: ' + targetEl);
					return;
				}

				applePayElements.applePayEl.addEventListener('click', event => {
					if (!self._checkoutPromiseSettlers) {
						self._log('Checkout was not started.');
						return;
					}

					applePayElements.applePayEl.setAttribute('disabled', '');

					var session = new ApplePaySession(1, self._applePayElements.paymentData);

					session.onvalidatemerchant = event => {
						// This is called by Apple with some data that we need to process server side.
						var requestData =
							'validationUrl=' + encodeURIComponent(event.validationURL)
							+ '&partnerMerchantIdentifier=' + encodeURIComponent(self._applePayElements.paymentData.partnerMerchantIdentifier)
							+ '&domain=' + window.location.hostname;
						self._apiRequest('post', 'payment/apple-pay/validate-merchant?token=' + self._intentToken, requestData, 'application/x-www-form-urlencoded')
							.then(responseData => session.completeMerchantValidation(responseData))
							.catch(error => {
								session.completeMerchantValidation({});
								self._checkoutPromiseSettlers.reject(error.message)
							});
					};

					session.onpaymentauthorized = event => {
						// For reasons only known to Apple, when we say FAILURE, the payment sheet remains open, hence we're always
						// responding with a success. To not mix the events up, we're adding a slight delay before we start calling
						// our start payment method (the sheet will slide out of view first and then a possible error or success
						// message will be shown).
						session.completePayment(ApplePaySession.STATUS_SUCCESS);
						var requestData = JSON.stringify({
							ApplePayTokenJson: JSON.stringify(event.payment.token)
						});
						setTimeout(() => self._startPayment(requestData), 2000);
					};

					session.begin();
				});

				self._apiRequest('post', 'payment/apple-pay/get-payment-request?token=' + self._intentToken)
					.then(responseData => {
						applePayElements.paymentData = responseData;
						// This method will return false if the domain isn't verified by apple - check this if it continues to return
						// false - apple regularly refreshes the domain verification.
						// It also happens that canMakePaymentsWithActiveCard returns false if no billing address has been setup with the card,
						// therefore the additional check using canMakePayments is also used and will show the button on all Apple devices.
						ApplePaySession.canMakePaymentsWithActiveCard(applePayElements.paymentData.partnerMerchantIdentifier)
							.then(canMakePayments => {
								if (canMakePayments || ApplePaySession.canMakePayments) {
									applePayElements.applePayEl.removeAttribute('hidden');
									self._applePayElements = applePayElements;
								}

								self._log('ApplePay was initialised.');
								resolve();
							})
					
					})
					.catch(error => reject(typeof error === 'string' ? error : error.message ?? 'An unexpected error occured.'));
			}
			catch(_) {
				reject('An unexpected error occured.');
			}
		});
	};

	// https://developers.google.com/pay/api/web/guides/tutorial#supported-card-networks
	// customize button: https://developers.google.com/pay/api/web/guides/resources/customize
	self.initGooglePay = (targetEl, buttonOptions) => {
		return new Promise((resolve, reject) => {
			try {
				var googlePayElements = {};

				googlePayElements.googlePayEl = targetEl instanceof HTMLElement ? targetEl : document.querySelector(targetEl);
				if (!googlePayElements.googlePayEl) {
					reject('Invalid button: ' + targetEl);
					return;
				}

				googlePayElements.buttonOptions = buttonOptions || {
					buttonColor: 'default',
					buttonSizeMode: 'fill',
					buttonType: 'plain'
				};
				googlePayElements.buttonOptions.onClick = () => {
					if (!self._checkoutPromiseSettlers) {
						self._log('Checkout was not started.');
						return;
					}

					googlePayElements.googlePayEl.setAttribute('disabled', '');

					self._googlePayElements.client.loadPaymentData(self._googlePayElements.paymentData)
						.then(paymentData => {
							var requestData = JSON.stringify({
								GooglePayTokenJson: paymentData.paymentMethodData.tokenizationData.token
							});
							self._startPayment(requestData);
						});
				};

				var loadScriptPromise = new Promise((resolve, reject) => {
					var script = document.createElement('script');
					script.onload = () => resolve();
					script.onerror = () => reject('Error while loading GooglePay javascript library.');
					script.src = 'https://pay.google.com/gp/p/js/pay.js';
					document.head.appendChild(script);
				});

				Promise.all([loadScriptPromise, self._apiRequest('post', 'payment/google-pay/get-payment-data-request?token=' + self._intentToken)])
					.then(results => {
						googlePayElements.paymentData = results.pop();
						googlePayElements.client = new google.payments.api.PaymentsClient({environment: googlePayElements.paymentData.environment});

						googlePayElements.client.isReadyToPay(googlePayElements.paymentData).then(response => {
							if (response.result) {
								googlePayElements.client.prefetchPaymentData(googlePayElements.paymentData);

								googlePayElements.googlePayEl.appendChild(googlePayElements.client.createButton(googlePayElements.buttonOptions))
								googlePayElements.googlePayEl.removeAttribute('hidden');
		
								self._googlePayElements = googlePayElements;
							}
							else {
								self._log('GooglePay not available on this device.');
							}

							self._log('GooglePay was initialised.');
							resolve();
						});
					})
					.catch(error => reject(typeof error === 'string' ? error : error.message ?? 'An unexpected error occured.'));
			}
			catch(_) {
				reject('An unexpected error occured.');
			}
		});
	};

	self.checkout = () => {
		self._checkoutPromiseSettlers = {};
		self._checkoutPromiseSettlers.promise = new Promise((resolve, reject) => {
			self._getPaymentIntent(self._intentToken)
				.then(data => {
					if (data.paymentStatus != 'Pending') {
						reject('Invalid payment state: ' + data.paymentStatus);
						return;
					}

					self._installUpdateEventsListener();

					self._checkoutPromiseSettlers.resolve = resolve;
					self._checkoutPromiseSettlers.reject = reject;
				})
				.catch(error => reject(error));
		});

		return self._checkoutPromiseSettlers.promise;
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
								if (data.paymentStatus == 'Paid' || data.paymentStatus == 'Verified') {
									self._checkoutPromiseSettlers.resolve();
								}
								else {
									self._checkoutPromiseSettlers.reject('Payment failed.');
								}
							}
						}
					})
					.catch(error => self._checkoutPromiseSettlers.reject(error));
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

	self._apiRequest = (method, endpoint, data = {}, contentType = 'application/json') => {
		return new Promise((resolve, reject) => {
			let xhr = new XMLHttpRequest();

			xhr.open(method.toUpperCase(), self._endpoint + endpoint);
			xhr.setRequestHeader('Content-Type', contentType);

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

			xhr.send(data);
		});
	};

	self._getPaymentIntent = () => {
		return self._apiRequest('get', 'api/gateway/payment-intents/' + self._intentToken)
			.then(responseData => Promise.resolve(responseData.data))
			.catch(error => Promise.reject(error.status == 404 ? 'Invalid payment intent.' : error.message));
	};

	self._startPayment = (requestData) => {
		return self._apiRequest('post', 'api/gateway/payment-intents/' + self._intentToken + '/payments', requestData)
			.then(responseData => {
				if (responseData.data.paymentStatus == 'Paid' || responseData.data.paymentStatus == 'Verified') {
					self._checkoutPromiseSettlers.resolve();
				}
				else if (responseData.data.paymentStatus == 'Pending' && responseData.links?.action?.url) {
					self._openActionLink(responseData.links.action.url);
				}
				else {
					self._checkoutPromiseSettlers.reject('Payment failed.');
				}
			})
			.catch(error => self._checkoutPromiseSettlers.reject(error.message));
	};

	self._log = (message) => {
		if (self._isIntegration) {
			console.log(message);
		}
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
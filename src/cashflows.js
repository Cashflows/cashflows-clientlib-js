import { default as axios } from 'axios';
import { v4 as uuidv4 } from 'uuid';

const CASHFLOWS_CLASSNAME_PREFIX = 'cf-';
const CASHFLOWS_INTEGRATION_ENDPOINT = 'https://gateway-int.cashflows.com/';
const CASHFLOWS_PRODUCTION_ENDPOINT = 'https://gateway.cashflows.com/';
const CASHFLOWS_CARD_LIST_ITEM_TEMPLATE =
	'<li class="' + CASHFLOWS_CLASSNAME_PREFIX + 'card-list-item">'
	+ '<input type="radio" name="card-list-item" id="card-list-item-index-{index}" value="{encryptedCardData}" class="' + CASHFLOWS_CLASSNAME_PREFIX + 'card-list-radio">'
	+ '<label for="card-list-item-index-{index}">'
	+ '<span><strong>{maskedCardNumber}</strong></span>'
	+ '<span>Expires <strong>{cardExpiryMonth}/{cardExpiryYear}</strong></span>'
	+ '</label>'
	+ '<button value="{encryptedCardData}" class="' + CASHFLOWS_CLASSNAME_PREFIX + 'card-list-remove"></button>'
	+ '</li>';

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
	self._pollTimer = null;

	self._checkoutPromiseSettlers = null; // not null also indicates a checkout has started

	// The checkoutIntent promises are used by the various initialisation scripts to complete their initialisation
	// when the intent is successfully validated during checkout. The array contains functions that return the
	// promise instead of the promises themselves to delay their execution.
	self._checkoutIntentPromises = [];

	// Use the default template to render the card list items. This can be overridden.
	this.cardListItemTemplate = CASHFLOWS_CARD_LIST_ITEM_TEMPLATE;

	// Public methods.

	self.initCard = (cardNumberEl, cardNameEl, cardExpiryEl, cardCvcEl, buttonEl, storeCardDetailsEl, cardListEl) => {
		return new Promise((resolve, reject) => {
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
				var uuid = uuidv4();
				iframe.setAttribute('frameborder', '0');
				iframe.setAttribute('scrolling', 'no');
				iframe.setAttribute('allowtransparency', 'true');
				iframe.setAttribute('data-uuid', uuid);

				iframe.setAttribute('src', self._endpoint + 'preparations/' + uuid + '?inputtype=' + key);
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

				// Replace input field with iframe.
				element.parentNode.insertBefore(iframe, element);
				element.parentNode.removeChild(element);

				self._preparationIds[uuid] = {
					iframe: iframe,
					valid: false
				}
			});

			// If stored shopper elements have been passed, we need to make sure they're valid.
			if (storeCardDetailsEl || cardListEl) {
				cardElements.storeCardDetails = storeCardDetailsEl instanceof HTMLInputElement ? storeCardDetailsEl : document.querySelector(storeCardDetailsEl);
				if (!cardElements.storeCardDetails) {
					reject('Invalid checkbox: ' + storeCardDetailsEl);
					return;
				}

				cardElements.cardList = cardListEl instanceof HTMLDivElement ? cardListEl : document.querySelector(cardListEl);
				if (!cardElements.cardList) {
					reject('Invalid div: ' + cardListEl);
					return;
				}

				// Only continue with fetching stored cards when the checkoutIntentPromise resolves and thus intent has been validated.
				self._checkoutIntentPromises.push(() =>
					self._apiRequest('get', 'api/gateway/payment-intents/' + self._intentToken + '/stored-cards')
						.then(responseData => {
							if (responseData?.data && responseData.data instanceof Array && responseData?.data.length > 0) {
								let ulEl = document.createElement("ul");
								ulEl.classList.add(CASHFLOWS_CLASSNAME_PREFIX + 'card-list');

								// When the inner field is firing a validation event, or when the checkbox to store card details is
								// clicked, the radio button to use a stored card should be deselected.
								let fDeselect = () => {
									let inputEl = ulEl.querySelector('input:checked');
									if (inputEl) {
										inputEl.checked = false;
									}
								};
								window.addEventListener('message', event => {
									if (event.data.event == 'validate') {
										fDeselect();
									}
								});
								cardElements.storeCardDetails.addEventListener('change', _ => {
									fDeselect();
									var allValid = Object.keys(self._preparationIds).every(preparationId => self._preparationIds[preparationId].valid);
									if (allValid) {
										cardElements.cardSubmit.removeAttribute('disabled');
									}
									else {
										cardElements.cardSubmit.setAttribute('disabled', '');
									}
								});

								for (const [index, storedCard] of responseData.data.entries()) {
									let liHtml = self.cardListItemTemplate
										.replace(/{maskedCardNumber}/g, storedCard.maskedCardNumber)
										.replace(/{cardExpiryMonth}/g, storedCard.cardExpiryMonth)
										.replace(/{cardExpiryYear}/g, storedCard.cardExpiryYear)
										.replace(/{encryptedCardData}/g, storedCard.encryptedCardData)
										.replace(/{index}/g, index);

									ulEl.insertAdjacentHTML('beforeend', liHtml);
									let liEl = ulEl.lastChild;

									let inputEl = liEl.querySelector('input');
									inputEl.addEventListener('change', event => {
										if (inputEl.checked) {
											cardElements.cardSubmit.removeAttribute('disabled');
											cardElements.storeCardDetails.checked = false;
										}
									});

									let deleteEl = liEl.querySelector('button');
									deleteEl.addEventListener('click', event => {
										event.preventDefault();
										self._apiRequest('delete', 'api/gateway/payment-intents/' + self._intentToken + '/stored-cards/' + storedCard.encryptedCardData)
											.then(() => {
												ulEl.removeChild(liEl);
												if (!ulEl.querySelector('input')) {
													cardElements.cardList.setAttribute('hidden', 'hidden');
												}
											})
											.catch(error => self._log(error.message ?? 'An unexpected error has occurred.'));
									});
								}

								cardElements.cardList.appendChild(ulEl);
								cardElements.cardList.removeAttribute('hidden');
							}
						})
				);
			}

			cardElements.cardSubmit = buttonEl instanceof HTMLInputElement ? buttonEl : document.querySelector(buttonEl);
			if (!cardElements.cardSubmit) {
				reject('Invalid button: ' + buttonEl);
				return;
			}

			cardElements.cardSubmit.setAttribute('disabled', '');
			cardElements.cardSubmit.addEventListener('click', event => {
				event.preventDefault();

				if (!self._checkoutPromiseSettlers) {
					self._log('Checkout was not started.');
					return;
				}

				cardElements.cardSubmit.setAttribute('disabled', '');
				var requestData = {};
				var selectedStoredCard = cardElements.cardList?.querySelector('input:checked');
				if (selectedStoredCard) {
					requestData.storedCard = selectedStoredCard.value;
				}
				else {
					requestData.preparationIds = Object.keys(self._preparationIds);
					if (cardElements.storeCardDetails?.checked) {
						requestData.options = ['StoreCardDetails'];
					}
				}

				// We need to delay starting the payment a little bit to allow for the (last) payment preparation to be processed.
				// This is to prevent a timing issue where the customer would click the pay button, which would then fire off the
				// request to send the preparation for the input he/she was typing in. This can cause an issue where payment from
				// intent is being created before the last preparation was processed. This delay should reduce the time this
				// occurs or even prevent it from occurring at all.
				var delayInMilliseconds = 500; // 0.5 second: should probably be enough while not requiring the user to wait too long.
				setTimeout(function () {
					self._startPayment(requestData);
				}, delayInMilliseconds);
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
		});
	};

	// https://developer.apple.com/documentation/apple_pay_on_the_web/applepaysession/
	self.initApplePay = (targetEl) => {
		return new Promise((resolve, reject) => {
			var applePayElements = {};

			applePayElements.applePayEl = targetEl instanceof HTMLElement ? targetEl : document.querySelector(targetEl);
			if (!applePayElements.applePayEl) {
				reject('Invalid button: ' + targetEl);
				return;
			}

			// Silently fail if ApplePay is not available.
			if (!window.ApplePaySession || !ApplePaySession.canMakePayments()) {
				self._log('ApplePay not available on this device.');
				resolve();
				return;
			}

			applePayElements.applePayEl.addEventListener('click', () => {
				if (!self._checkoutPromiseSettlers) {
					self._log('Checkout was not started.');
					return;
				}

				applePayElements.applePayEl.setAttribute('disabled', '');

				var session = new ApplePaySession(1, self._applePayElements.paymentData);

				session.onvalidatemerchant = event => {
					// This is called by Apple with some data that we need to process server side.
					var requestData = new FormData();
					requestData.append('validationUrl', event.validationURL);
					requestData.append('partnerMerchantIdentifier', self._applePayElements.paymentData.partnerMerchantIdentifier);
					requestData.append('domain', window.location.hostname);
					self._apiRequest('post', 'payment/apple-pay/validate-merchant?token=' + self._intentToken, requestData)
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
					setTimeout(() => self._startPayment({
						ApplePayTokenJson: JSON.stringify(event.payment.token)
					}), 2000);
				};

				session.begin();
			});

			self._applePayElements = applePayElements;

			// Only continue when the checkoutIntentPromise resolves and thus intent has been validated.
			self._checkoutIntentPromises.push(() =>
				self._apiRequest('post', 'payment/apple-pay/get-payment-request?' + self._intentToken)
					.then(responseData => {
						self._applePayElements.paymentData = responseData;
						// This method will return false if the domain isn't verified by apple - check this if it continues to return
						// false - apple regularly refreshes the domain verification.
						// It also happens that canMakePaymentsWithActiveCard returns false if no billing address has been setup with the card,
						// therefore the additional check using canMakePayments is also used and will show the button on all Apple devices.
						ApplePaySession.canMakePaymentsWithActiveCard(self._applePayElements.paymentData.partnerMerchantIdentifier)
							.then(canMakePayments => {
								if (canMakePayments || ApplePaySession.canMakePayments) {
									self._applePayElements.applePayEl.removeAttribute('hidden');
								}
							})
					})
			);

			self._log('ApplePay was initialised.');
			resolve();
		});
	};

	// https://developers.google.com/pay/api/web/guides/tutorial#supported-card-networks
	// customize button: https://developers.google.com/pay/api/web/guides/resources/customize
	self.initGooglePay = (targetEl, buttonOptions, gatewayMerchantId) => {
		return new Promise((resolve, reject) => {
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
						self._startPayment({
							GooglePayTokenJson: paymentData.paymentMethodData.tokenizationData.token
						});
					});
			};

			var loadScriptPromise = new Promise((resolve, reject) => {
				var script = document.createElement('script');
				script.onload = () => resolve();
				script.onerror = () => reject('Error while loading GooglePay javascript library.');
				script.src = 'https://pay.google.com/gp/p/js/pay.js';
				document.head.appendChild(script);
			});
			
			loadScriptPromise
				.then(() => {
					self._googlePayElements = googlePayElements;
					self._log('GooglePay was initialised.');
					
					var merchantIdParameter = '';

					// If a merchant ID has been provided then we will append
					// it to the query parameters of the payments page.
					if (gatewayMerchantId)
					{
						merchantIdParameter = '&gatewayMerchantId=' + gatewayMerchantId;
					}

					// Only continue when the checkoutIntentPromise resolves and thus intent has been validated.
					self._checkoutIntentPromises.push(() =>
						self._apiRequest('post', 'payment/google-pay/get-payment-data-request?domain=' + encodeURIComponent(window.location.hostname) + '&token=' + self._intentToken + merchantIdParameter)
							.then(responseData => {
								self._googlePayElements.paymentData = responseData;
								self._googlePayElements.client = new google.payments.api.PaymentsClient({ environment: self._googlePayElements.paymentData.environment });

								var partialData = {
									'apiVersion': responseData.apiVersion,
									'apiVersionMinor': responseData.apiVersionMinor,
									'allowedPaymentMethods': responseData.allowedPaymentMethods,
									'merchantInfo': {
										'merchantId': responseData.merchantInfo.merchantId,
										'merchantName': responseData.merchantInfo.merchantName
									}
								};
								return self._googlePayElements.client.isReadyToPay(partialData)
									.then(response => {
										if (response.result) {
											self._googlePayElements.client.prefetchPaymentData(self._googlePayElements.paymentData);

											self._googlePayElements.googlePayEl.appendChild(googlePayElements.client.createButton(googlePayElements.buttonOptions))
											self._googlePayElements.googlePayEl.removeAttribute('hidden');
										}
										else {
											self._log('GooglePay not available on this device.');
										}
									});
							})
					);
				})
				.catch(error => self._log(error))
				// If initialising the GooglePay script fails, we're not going to fail the init method. It is
				// not the developers fault, it means GooglePay is not available.
				.finally(() => resolve());
		});
	};

	self.checkout = () => {
		self._checkoutPromiseSettlers = {};
		self._checkoutPromiseSettlers.promise = new Promise((resolve, reject) => {
			self._checkoutPromiseSettlers.resolve = resolve;
			self._checkoutPromiseSettlers.reject = reject;

			self.getPaymentIntent()
				.then(data => {
					if (data.paymentStatus != 'Pending') {
						reject('Invalid payment state: ' + data.paymentStatus);
					}
				})
				.then(() => Promise.all(self._checkoutIntentPromises.map(promise => promise())))
				.then(() => self._installUpdateEventsListener())
				.catch(error => reject(error.message ?? error ?? 'An unexpected error has occurred.'));
		});

		self._checkoutPromiseSettlers.promise
			.then(() => {
				self._log('The payment was successful.');
			})
			.catch(error => {
				self._log('The payment was unsuccessful: ' + error);
			});

		return self._checkoutPromiseSettlers.promise;
	};

	self.getPaymentIntent = () => {
		return self._apiRequest('get', 'api/gateway/payment-intents/' + self._intentToken)
			.then(responseData => {
				return responseData.data;
			})
			.catch(error => Promise.reject(error.status == 404 ? 'Invalid payment intent.' : error.message));
	};

	// Private methods.

	self._installUpdateEventsListener = () => {
		window.addEventListener('message', (event) => {
			if (event.data.event == 'update') {
				self._checkPayment();
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

		// Attach event listener that will fetch the latest payment intent status when a new page is loaded in the
		// challenge dialog. We first allow the page to execute any updates itself before forcing a check of the
		// intent from outside of the challenge dialog. This is a fail-safe in case the event doesn't arrive.
		iframe.onload = () => setTimeout(self._checkPayment, 2500);
	};

	self._apiRequest = (method, endpoint, data = undefined) => {
		return new Promise((resolve, reject) => {
			var request = {
				baseURL: self._endpoint,
				method: method,
				url: endpoint,
				data: data,
				validateStatus: status => {
					return status >= 200 && status < 400;
				}
			};
			axios(request)
				.then(response => resolve(response.data))
				.catch(error => reject({ status: error.response?.status, message: error.response?.data?.errorReport?.errors[0]?.message ?? 'Invalid response.' }));
		});
	};

	self._startPayment = (requestData) => {
		// Set the payment origin before sending the request body to the gateway.
		requestData.PaymentDataOrigin = "cashflows-clientlib-js";

		return self._apiRequest('post', 'api/gateway/payment-intents/' + self._intentToken + '/payments', requestData)
			.then(responseData => {
				if (responseData.data.paymentStatus == 'Paid' || responseData.data.paymentStatus == 'Verified' || (responseData.data.paymentStatus == 'Pending' && responseData.data.lastPaymentStatus == 'Reserved')) {
					self._checkoutPromiseSettlers.resolve(responseData.data);
				}
				else if (responseData.data.paymentStatus == 'Pending') {
					// Start polling as an absolute fail-safe when iframe loads and events are not coming through. We need to
					// remove the timer when we've got a final payment intent status.
					self._pollTimer = setInterval(self._checkPayment, 5000);
					if (responseData.links?.action?.url) {
						self._openActionLink(responseData.links.action.url);
					}
				}
				else {
					self._checkoutPromiseSettlers.reject('Payment failed.');
				}
			})
			.catch(error => self._checkoutPromiseSettlers.reject(error.message));
	};

	self._checkPayment = () => {
		self.getPaymentIntent()
			.then(data => {
				if (data && data.paymentStatus) {
					if (data.paymentStatus != 'Pending' || (data.paymentStatus == 'Pending' && data.lastPaymentStatus == 'Reserved')) {
						self._challengeDialog?.remove();
						clearTimeout(self._pollTimer);
						if (data.paymentStatus == 'Paid' || data.paymentStatus == 'Verified' || (data.paymentStatus == 'Pending' && data.lastPaymentStatus == 'Reserved')) {
							// With the pollers and events in place, there's a possibility that resolve is called multiple times on
							// the promise, but those additional calls will have no effect. The then- and catch callbacks are only
							// called once.
							self._checkoutPromiseSettlers.resolve(data);
						}
						else {
							self._checkoutPromiseSettlers.reject(data.lastErrorReport?.errors[0].translatedMessage ?? 'Payment failed.');
						}
					}
				}
			})
			.catch(error => self._checkoutPromiseSettlers.reject(error));
	};

	self._log = (message) => {
		if (self._isIntegration) {
			console.log(message);
		}
	};
}

globalThis.Cashflows = Cashflows;
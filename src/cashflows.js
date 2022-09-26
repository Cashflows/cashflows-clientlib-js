const CASHFLOWS_CLASSNAME_PREFIX = 'cf-';
const CASHFLOWS_INTEGRATION_ENDPOINT = 'https://gateway-int.cashflows.com/';
const CASHFLOWS_PRODUCTION_ENDPOINT = 'https://gateway.cashflows.com/';

export function Cashflows(isIntegration) {
	var self = this;

	self._intentToken = '';
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
					var uuid = self._uuid();
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
						iframe: iframe
					}
				});

				cardElements.cardSubmit = buttonEl instanceof HTMLInputElement ? buttonEl : document.querySelector(buttonEl);
				if (!cardElements.cardSubmit) {
					reject('Invalid button: ' + buttonEl);
					return;
				}

				cardElements.cardSubmit.addEventListener('click', event => {
					event.preventDefault();

					if (self._checkoutPromise) {
						cardElements.cardSubmit.setAttribute('disabled', '');
		
						self._httpRequest('post', 'payment-intents/' + self._intentToken + '/payments', {
							'preparationIds': Object.keys(self._preparationIds)
						}).then(data => {
							if (data && data.links && data.links.action && data.links.action.url) {
								self._openActionLink(data.links.action.url);
							}
							else {
								self._checkoutPromise.reject('Invalid response.');
							}
						})
						.catch(e => {
							self._checkoutPromise.reject('Communication failure.');
						});
					}
				}, true);

				window.addEventListener("message", (event) => {
					if (event.data.event == 'validate') {
						var iframe = self._preparationIds[event.data.preparationId].iframe;
						if (!event.data.valid) {
							iframe.classList.add(CASHFLOWS_CLASSNAME_PREFIX + 'error');
							var span = self._preparationIds[event.data.preparationId].span;
							if (!span) {
								span = document.createElement('span');
								span.classList.add(CASHFLOWS_CLASSNAME_PREFIX + 'message');
							}
							span.innerHTML = event.data.message;
							iframe.parentNode.insertBefore(span, iframe.nextSibling);
							self._preparationIds[event.data.preparationId].span = span;
						}
						else {
							iframe.classList.remove(CASHFLOWS_CLASSNAME_PREFIX + 'error');
							if (self._preparationIds[event.data.preparationId].span) {
								iframe.parentNode.removeChild(self._preparationIds[event.data.preparationId].span);
							}
							delete(self._preparationIds[event.data.preparationId].span);
						}
					}
				});

				self._cardElements = cardElements;

				resolve();
			}
			catch(e) {
				reject();
			}
		});
	};

	self.initApplePay = (buttonEl) => {
		console.warn('ApplePay is not yet supported');
		return new Promise((resolve, reject) => {
			resolve();
		});
	};

	self.initGooglePay = (buttonEl) => {
		console.warn('GooglePay is not yet supported');
		return new Promise((resolve, reject) => {
			resolve();
		});
	};

	self.initPayPal = (buttonEl) => {
		console.warn('PayPal is not yet supported');
		return new Promise((resolve, reject) => {
			resolve();
		});
	};

	self.checkout = (intentToken) => {
		return new Promise((resolve, reject) => {
			self._httpRequest('get', 'payment-intents/' + intentToken)
			.then(response => {
				if (response.data.paymentStatus == 'Pending') {
					self._intentToken = intentToken;
					self._checkoutPromise = { resolve: resolve, reject: reject };
					self._installUpdateEventsListeners();
				}
				else {
					reject('Payment does not have a pending state.');
				}
			})
			.catch((e, xhr) => {
				if (e.xhr.status == 404) {
					reject('Invalid payment intent.');
				}
				else {
					reject('Communication failure.');
				}
			});
		});
	};

	// Private methods.

	self._installUpdateEventsListeners = () => {
		window.addEventListener('message', (event) => {
			if (event.data.event == 'update') {
				self._httpRequest('get', 'payment-intents/' + self._intentToken)
				.then(data => {
					if (data && data.data && data.data.paymentStatus) {
						if (data.data.paymentStatus != 'Pending') {
							self._challengeDialog.remove();
							if (data.data.paymentStatus == 'Paid') {
								self._checkoutPromise.resolve();
							}
							else {
								self._checkoutPromise.reject('Invalid payment status.');
							}
						}
					}
				})
				.catch(e => {
					self._checkoutPromise.reject('Communication failure.');
				});
			}
		}, false);
	};

	self._openActionLink = function(link) {
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

	self._httpRequest = function(method, endpoint, data = {}) {
		let xhr = new XMLHttpRequest();
		xhr.open(method.toUpperCase(), self._endpoint + 'api/gateway/' + endpoint);
		xhr.setRequestHeader('Content-Type', 'application/json');

		xhr.send(JSON.stringify(data));
	
		return new Promise((resolve, reject) => {
			xhr.onload = () => {
				if (xhr.status >= 200 && xhr.status < 400) {
					try {
						resolve(JSON.parse(xhr.responseText));
					}
					catch(e) {
						reject({ e: e, xhr: xhr });
					}
				}
				else {
					reject({ e: undefined, xhr: xhr });
				}
			}
	
			xhr.onerror = () => {
				reject({ e: undefined, xhr: xhr });
			}
		});
	}

	self._uuid = function() {
		var d = new Date().getTime(); // timestamp
		var d2 = ((typeof performance !== 'undefined') && performance.now && (performance.now()*1000)) || 0; // time in microseconds since page-load or 0 if unsupported
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
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
	}
}

globalThis.Cashflows = Cashflows;
const CASHFLOWS_CLASSNAME_PREFIX = 'cf-';
const CASHFLOWS_INTEGRATION_ENDPOINT = 'https://gateway-int.cashflows.com/';
const CASHFLOWS_PRODUCTION_ENDPOINT = 'https://gateway.cashflows.com/';

export function Cashflows(intentToken, isIntegration) {
	var self = this;

	self._intentToken = intentToken;
	self._isIntegration = isIntegration;

	self._endpoint = self._isIntegration ? CASHFLOWS_INTEGRATION_ENDPOINT : CASHFLOWS_PRODUCTION_ENDPOINT;

	self._preparationIds = {};
	self._cardElements = {};

	self._onSubmit = self._onSuccess = self._onFailure = function() {};

	window.addEventListener("message", (event) => {
		console.log(event);
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

		if (event.data.event == 'update') {
			self._httpRequest('get', 'payment-intents/' + self._intentToken)
			.then(data => {
				if (data && data.data && data.data.paymentStatus) {
					if (data.data.paymentStatus != 'Pending') {
						self._challengeDialog.remove();
						if (data.data.paymentStatus == 'Paid') {
							self._onSuccess();
						}
						else {
							self._onFailure();
						}
					}
				}
			})
			.catch(() => {
				console.log('Failure.');
			});
		}
	}, false);

	self.initCard = (cardNumberEl, cardNameEl, cardExpiryEl, cardCvcEl, buttonEl) => {
		return new Promise((resolve, reject) => {
			self._cardElements.cardnumber = cardNumberEl instanceof HTMLInputElement ? cardNumberEl : document.querySelector(cardNumberEl);
			self._cardElements.cardholdername = cardNameEl instanceof HTMLInputElement ? cardNameEl : document.querySelector(cardNameEl);
			self._cardElements.cardexpiry = cardExpiryEl instanceof HTMLInputElement ? cardExpiryEl : document.querySelector(cardExpiryEl);
			self._cardElements.cardcvc = cardCvcEl instanceof HTMLInputElement ? cardCvcEl : document.querySelector(cardCvcEl);

			var elements = Object.keys(self._cardElements).filter(key => !(self._cardElements[key] instanceof HTMLInputElement));
			if (elements.length > 0) {
				reject('Invalid element(s): ' + elements.join(','));
				return;
			}

			self._cardSubmit = buttonEl instanceof HTMLInputElement ? buttonEl : document.querySelector(buttonEl);
			if (!self._cardSubmit) {
				reject('Invalid button: ' + buttonEl);
				return;
			}

			Object.keys(self._cardElements).forEach(key => {
				var element = self._cardElements[key];

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

			self._cardSubmit.addEventListener('click', (event) => {
				event.preventDefault();

				self._cardSubmit.setAttribute('disabled', '');
				self._onSubmit();

				self._httpRequest('post', 'payment-intents/' + self._intentToken + '/payments', {
					'preparationIds': Object.keys(self._preparationIds)
				}).then(data => {
					if (data && data.links && data.links.action && data.links.action.url) {
						self.openActionLink(data.links.action.url);
					}
					else {
						self._onFailure();
					}
				})
				.catch(() => {
					self._onFailure();
				});
			}, true);

			resolve();
		});
	};

	self.initApplePay = function(buttonEl) {
		console.warn('ApplePay is not yet supported');

	};

	self.initGooglePay = function(buttonEl) {
		console.warn('GooglePay is not yet supported');
	};

	self.initPayPal = function(buttonEl) {
		console.warn('PayPal is not yet supported');
	};

	self.onSubmit = function(func) {
		self._onSubmit = func;
	};

	self.onSuccess = function(func) {
		self._onSuccess = func;
	};

	self.onFailure = function(func) {
		self._onFailure = func;
	};

	self.openActionLink = function(link) {
		// This method creates an iframe modal dialog that loads the action url. The payment page itself will also load
		// an iframe. Anytime a new payment page is loaded, an event is thrown to the parent page (us) and we can use that
		// to fetch the latest payment job and see if we need to redirect to a success- or failure url.
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
				try {
					resolve(JSON.parse(xhr.responseText));
				}
				catch(e) {
					reject();
				}
			}
	
			xhr.onerror = () => {
				try {
					reject(JSON.parse(xhr.responseText));
				}
				catch(e) {
					reject();
				}
			}
		});
	}

	self._uuid = function() {
		var d = new Date().getTime(); // Timestamp.
		var d2 = ((typeof performance !== 'undefined') && performance.now && (performance.now()*1000)) || 0; // Time in microseconds since page-load or 0 if unsupported.
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
			var r = Math.random() * 16; // Random number between 0 and 16.
			if(d > 0){ // Use timestamp until depleted.
				r = (d + r)%16 | 0;
				d = Math.floor(d/16);
			} else { // Use microseconds since page-load if supported.
				r = (d2 + r)%16 | 0;
				d2 = Math.floor(d2/16);
			}
			return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
		});
	}
}

globalThis.Cashflows = Cashflows;
<?php
    // The customer is stored in the session.
    session_start();

    // First thing we need to do is create a payment intent using an API call to Cashflows. For that, we need
    // the API credentials obtained from the portal.
    $sConfigurationId = '<configuration id goes here>';
    $sApiKey = '<api key goes here>';

    // Choose the integration or production API.
    $sApiUrl = 'https://gateway-int.cashflows.com/api/gateway/';
    // $sApiUrl = 'https://gateway.cashflows.com/api/gateway/';

    $iAmount = isset($_GET['amount']) ? $_GET['amount'] : 10.99;
    $sCurrency = isset($_GET['currency']) ? $_GET['currency'] : 'GBP';

    // A create payment intent request is a POST request to the API using JSON as the body, which we're going to
    // prepare below.
    $aCreatePaymentIntentRequest = [
        'configurationId' => $sConfigurationId,
        'amountToCollect' => number_format($iAmount, 2),
        'currency' => $sCurrency,
        'locale' => 'en_GB',
        'paymentMethodsToUse' => [ 'Card' ],
        'options' => [ 'StoreCustomerInformation' ],
        'order' => [
            'billingAddress' => [
                'firstName'=> '<firstname goes here>',
                'lastName' => '<lastname goes here>',
                'AddressLine1' => '<address goes here>',
                'ZipCode' => '<zipcode goes here>'
            ],
            'billingIdentity' =>  [
                'emailAddress' => '<email address goes here>'
            ]
        ]
    ];

    // If the customer is a returning customer, add the customer reference to the request to be able to fetch
    // the stored cards.
    if (isset($_SESSION['customerReference'])) {
        $aCreatePaymentIntentRequest['order']['customerReference'] = $_SESSION['customerReference'];
    }

    $jCreatePaymentIntentRequest = json_encode($aCreatePaymentIntentRequest);
    $sHash = strtoupper(bin2hex(hash('sha512', $sApiKey . $jCreatePaymentIntentRequest, true)));

    // The actual call to the API requires the headers to be set up according to the documentation.
    $aOptions = [
        'http' => [
            'ignore_errors' => false,
            'header' =>
                "Content-type: application/json\r\n" .
                "ConfigurationId: {$sConfigurationId}\r\n" .
            "Hash: {$sHash}\r\n",
            'method' => 'POST',
            'content' => $jCreatePaymentIntentRequest
        ]
    ];
    $oContext = stream_context_create($aOptions);
    $sResults = file_get_contents($sApiUrl . 'payment-intents/', false, $oContext);

    // We should have a valid payment intent now. A payment intent should contain a token which we need to
    // initialise the iframe solution.
    if (
        !$sResults
        || !($aResults = json_decode($sResults, TRUE))
        || !isset($aResults['data']['paymentJobReference'])
        || !isset($aResults['data']['token'])
    ) {
        die('Error during creation of a payment intent using the Cashflows API.');
    }

    $sPaymentJobReference = $aResults['data']['paymentJobReference'];
    $sToken = $aResults['data']['token'];
    $sCurrency = $aCreatePaymentIntentRequest['currency'];
    $sAmount = $aCreatePaymentIntentRequest['amountToCollect'];

    // For the stored shopper implementation we need the customer reference and remember it for future purchases.
    if (! isset($_SESSION['customerReference'])) {
        $sHash = strtoupper(bin2hex(hash('sha512', $sApiKey, true)));

        $aOptions = [
            'http' => [
                'ignore_errors' => false,
                'header' =>
                    "ConfigurationId: {$sConfigurationId}\r\n" .
                    "Hash: {$sHash}\r\n",
                'method' => 'GET'
            ]
        ];
        $oContext = stream_context_create($aOptions);
        $sResults = file_get_contents($sApiUrl . 'payment-jobs/' . $sPaymentJobReference, false, $oContext);

        if (
            !$sResults
            || !($aResults = json_decode($sResults, TRUE))
            || !isset($aResults['data']['order'])
            || !isset($aResults['data']['order']['customerReference'])
        ) {
            die('Error during fetch of a payment job using the Cashflows API.');
        }

        $_SESSION['customerReference'] = $aResults['data']['order']['customerReference'];
    }
?>
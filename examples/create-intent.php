<?php
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
        'paymentMethodsToUse' => [ 'Card' ]
    ];

    $jCreatePaymentIntentRequest = json_encode($aCreatePaymentIntentRequest);
    $sHash = strtoupper(bin2hex(hash('sha512', $sApiKey . $jCreatePaymentIntentRequest, true)));

    // The actual call to the API requires the headers to be set up according to the documentation.
    $aOptions = [
        'http' => [
            'ignore_errors' => false,
            'header' =>
                "Content-type: application/json\r\n" .
                "ConfigurationId: {$sConfigurationId}\r\n" .
                "Hash: {$sHash}\r\n" .
                "RequestOrigin: cashflows-clientlib-js",
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
?>
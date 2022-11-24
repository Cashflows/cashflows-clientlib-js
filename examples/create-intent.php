<?php
    // First thing we need to do is create a payment intent using an API call to Cashflows. For that, we need
    // the API credentials obtained from the portal.
    $sConfigurationId = '<configuration id goes here>';
    $sApiKey = '<api key goes here>';

    // Choose the integration or production API.
    $sApiUrl = 'https://gateway-int.cashflows.com/api/gateway/payment-intents/';
    // $sApiUrl = 'https://gateway.cashflows.com/api/gateway/payment-intents/';

    $iAmount = isset($_GET['amount']) ? $_GET['amount'] : 10.99;
    $sCurrency = isset($_GET['currency']) ? $_GET['currency'] : 'GBP';

    // A create payment intent request is a POST request to the API using JSON as the body, which we're going to
    // prepare below.
    $aCreatePaymentJobRequest = [
        'configurationId' => $sConfigurationId,
        'amountToCollect' => number_format($iAmount, 2),
        'currency' => $sCurrency,
        'locale' => 'en_GB',
        'paymentMethodsToUse' => [ 'Card' ]
    ];

    $jCreatePaymentJobRequest = json_encode($aCreatePaymentJobRequest);
    $sHash = strtoupper(bin2hex(hash('sha512', $sApiKey . $jCreatePaymentJobRequest, true)));

    // The actual call to the API requires the headers to be set up according to the documentation.
    $aOptions = [
        'http' => [
            'ignore_errors' => false,
            'header' =>
                "Content-type: application/json\r\n" .
                "ConfigurationId: {$sConfigurationId}\r\n" .
            "Hash: {$sHash}\r\n",
            'method' => 'POST',
            'content' => $jCreatePaymentJobRequest
        ]
    ];
    $oContext = stream_context_create($aOptions);
    $sResults = file_get_contents($sApiUrl, false, $oContext);

    // We should have a valid payment intent now. A payment intent should contain a token which we need to
    // initialise the iframe solution.
    if (
        !$sResults
        || !($aResults = json_decode($sResults, TRUE))
        || !isset($aResults['data']['paymentJobReference'])
        || !isset($aResults['data']['token'])
    ) {
        die('Error during creation of a payment job using the Cashflows API.');
    }

    $sPaymentJobReference = $aResults['data']['paymentJobReference'];
    $sToken = $aResults['data']['token'];
    $sCurrency = $aCreatePaymentJobRequest['currency'];
    $sAmount = $aCreatePaymentJobRequest['amountToCollect'];
?>
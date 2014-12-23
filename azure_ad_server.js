AzureAd = {};

AzureAd.whitelistedFields = ['objectId', 'userPrincipleName', 'mail', 'displayName', 'surname', 'givenName'];


OAuth.registerService('azureAd', 2, null, function(query) {

    var response = getTokens(query);
    var accessToken = response.accessToken;
    var identity = getIdentity(accessToken);

    var serviceData = {
        accessToken: accessToken,
        expiresAt: (+new Date) + (1000 * response.expiresIn)
    };

    var fields = _.pick(identity, AzureAd.whitelistedFields);

    //must re-write the objectId field to id - meteor expects a field named "id"
    fields.id = fields.objectId;
    delete fields.objectId;

    _.extend(serviceData, fields);

    // only set the token in serviceData if it's there. this ensures
    // that we don't lose old ones (since we only get this on the first
    // log in attempt)
    if (response.refreshToken)
        serviceData.refreshToken = response.refreshToken;

    return {
        serviceData: serviceData,
        options: { profile: { name: identity.displayName } }
    };
});

// returns an object containing:
// - accessToken
// - expiresIn: lifetime of token in seconds
// - refreshToken, if this is the first authorization request
var getTokens = function (query) {
    var config = ServiceConfiguration.configurations.findOne({service: 'azureAd'});
    if (!config)
        throw new ServiceConfiguration.ConfigError();

    var response;
    try {
        var url = "https://login.windows.net/" + config.tennantId + "/oauth2/token/";
        var requestBody = {
            params: {
                client_id: config.clientId,
                grant_type: 'authorization_code',
                client_secret : OAuth.openSecret(config.clientSecret),
                resource: "https://graph.windows.net",
                redirect_uri: OAuth._redirectUri('azureAd', config),
                code: query.code
            }
        };

        response = HTTP.post(
            url,
            requestBody
        );
    } catch (err) {
        throw _.extend(new Error("Failed to complete OAuth handshake with AzureAd. " + err.message),
            {response: err.response});
    }

    if (response.data.error) { // if the http response was a json object with an error attribute
        throw new Error("Failed to complete OAuth handshake with AzureAd. " + response.data.error);
    } else {
        return {
            accessToken: response.data.access_token,
            refreshToken: response.data.refresh_token,
            expiresIn: response.data.expires_in
        };
    }
};

var getIdentity = function (accessToken) {
    try {
        var response =  HTTP.get(
            "https://graph.windows.net/93aea0df-f872-44a6-86aa-1f87271427f4/me?api-version=2013-11-08",
            {headers: { Authorization : "Bearer " + accessToken} });
        return response.data;
    } catch (err) {
        throw _.extend(new Error("Failed to fetch identity from AzureAd. " + err.message),
            {response: err.response});
    }
};


AzureAd.retrieveCredential = function(credentialToken, credentialSecret) {
    return OAuth.retrieveCredential(credentialToken, credentialSecret);
};
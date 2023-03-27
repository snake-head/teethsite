window.linkConfig = {
    login: '/api/v2/login/',
    // login: '/teethAPI2.0d/api/login',
    // login: 'https://api.digi-ortho.com:8443/teethAPI2.0d/api/login',

    modelDownloadLinkQueryApi: '/api/v2/data/model/',
    // modelDownloadLinkQueryApi: '/teethAPI2.0d/api/data/model',
    // modelDownloadLinkQueryApi: 'https://api.digi-ortho.com:8443/teethAPI2.0d/api/data/model',

    // modelDownloadLinkQueryFullApi: '/api/v2/data/model/?patientUid={#param_patientUID#}&modelType=#param_modelType#',
    modelDownloadLinkQueryFullApi: '/api/v2/data/model/?patientUid=#param_patientUID#&modelType=#param_modelType#',


    modelDataQueryApi: '/data/teeth',
    // modelDataQueryApi: '/data/teeth',
    // modelDataQueryApi: 'https://api.digi-ortho.com:8443/data/teeth',

    bracketTypeInfoQueryApi: '/api/v2/data/BracketTypeInfoServlet/',
    // bracketTypeInfoQueryApi: '/teethAPI2.0d/api/BracketTypeInfoServlet',
    // bracketTypeInfoQueryApi: 'https://api.digi-ortho.com:8443/teethAPI2.0d/api/BracketTypeInfoServlet',

    // bracketTypeFileQueryApi: '/api/v2/BracketTypeFileServlet/',
    bracketTypeFileQueryApi: '/teethAPI2.0/api/BracketTypeFileServlet',
    // https://api.digi-ortho.com:8443/teethAPI2.0d/api/BracketTypeFileServlet?DownloadBracketTypeId=299
    // https://www.digi-ortho.com/teethAPI2.0d/api/BracketTypeFileServlet?DownloadBracketTypeId=299
    // bracketTypeFileQueryApi: 'https://api.digi-ortho.com:8443/api/BracketTypeFileServlet',

    saveDataApi: '/api/v2/data/model/',
    // saveDataApi: '/teethAPI2.0d/api/data/model',
    // saveDataApi: 'https://api.digi-ortho.com:8443/teethAPI2.0d/api/data/model',

    checkDataApi: '/api/v2/data/ModelStateServlet/',

    patientInfoQueryApi: '/api/v2/data/patientUidSearch/?PatientUid=#param_patientUID#',
    // patientInfoQueryApi: '/api/v2/data/patientInfo/?flag=ByIndex&index=#param_index#&count=#param_count#',

    rollbackDataApi: '/api/v2/data/ModelStateRollBackServlet/',

}
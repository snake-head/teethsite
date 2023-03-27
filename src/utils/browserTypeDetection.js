function browserType() {
    const userAgent = window.navigator.userAgent;
    if (userAgent.indexOf("Edge") > -1) {
        return "Edge";
    }
    if (userAgent.indexOf("Firefox") > -1) {
        return "Firefox";
    }
    if (userAgent.indexOf("Chrome") > -1) {
        return "Chrome";
    }
    if (userAgent.indexOf("Safari") > -1) {
        return "Safari";
    }
    if (userAgent.indexOf("Opera") > -1) {
        return "Opera";
    }
    if (
        userAgent.indexOf(".NET") > -1 ||
        (userAgent.indexOf("compatible") > -1 && userAgent.indexOf("MSIE") > -1)
    ) {
        return "IE";
    }
    return "null";
}

function detectPageZoom() {
    let ratio = 0,
        screen = window.screen,
        ua = navigator.userAgent.toLowerCase();

    if (window.devicePixelRatio !== undefined) {
        ratio = window.devicePixelRatio;
    } else if (~ua.indexOf("msie")) {
        if (screen.deviceXDPI && screen.logicalXDPI) {
            ratio = screen.deviceXDPI / screen.logicalXDPI;
        }
    } else if (
        window.outerWidth !== undefined &&
        window.innerWidth !== undefined
    ) {
        ratio = window.outerWidth / window.innerWidth;
    }

    if (ratio) {
        ratio = Math.round(ratio * 100) / 100;
    }
    return ratio;
}

export { browserType, detectPageZoom };

// 主要用于调整牙弓线的几条线的设置

// 试一试用class写
export class DentalArchAdjustWidgetsManager {
    constructor(initialValues = {}) {
        this.dentalArchWidgets = {}; // 每次调整后再排牙后需要重新设置
        Object.assign(this, initialValues);
    }
    get dentalArchWidget() {
        return this.dentalArchWidget;
    }
    set renderer(_interactor) {
        this.interactor = _interactor;
        console.log('interactor', _interactor);
    }
}
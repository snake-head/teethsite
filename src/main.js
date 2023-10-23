/*
 * @Description: 
 * @Version: 1.0
 * @Autor: ZhuYichen
 * @Date: 2023-05-16 15:29:52
 * @LastEditors: ZhuYichen
 * @LastEditTime: 2023-10-16 16:33:34
 */
import { createApp } from "vue";
import App from "./App.vue";
//引入路由器
import router from "./router";
import store from './store';
//按需引入
import {
    ElAside,
    ElButton,
    ElButtonGroup,
    ElCheckbox,
    ElCheckboxButton,
    ElCheckboxGroup,
    ElCol,
    ElCollapseTransition,
    ElContainer,
    ElDialog,
    ElDropdown,
    ElDropdownItem,
    ElDropdownMenu,
    ElHeader,
    ElIcon,
    ElInputNumber,
    ElMain,
    ElMenu,
    ElMenuItem,
    ElMenuItemGroup,
    ElMessage,
    ElPopover,
    ElProgress,
    ElRadioGroup,
    ElRadioButton,
    ElRow,
    ElSlider,
    ElStep,
    ElSteps,
    ElSubmenu,
    ElTabs,
    ElTabPane,
} from "element-plus";
import "element-plus/lib/theme-chalk/index.css";

const app = createApp(App);
//应用插件
app.use(router);
app.use(store);

//应用ElementUI
const components = [
    ElAside,
    ElButton,
    ElButtonGroup,
    ElCheckbox,
    ElCheckboxButton,
    ElCheckboxGroup,
    ElCol,
    ElCollapseTransition,
    ElContainer,
    ElDialog,
    ElDropdown,
    ElDropdownItem,
    ElDropdownMenu,
    ElHeader,
    ElIcon,
    ElInputNumber,
    ElMain,
    ElMenu,
    ElMenuItem,
    ElMenuItemGroup,
    ElMessage,
    ElPopover,
    ElProgress,
    ElRadioGroup,
    ElRadioButton,
    ElRow,
    ElSlider,
    ElStep,
    ElSteps,
    ElSubmenu,
    ElTabs,
    ElTabPane,
];
components.forEach((component) => {
    app.component(component.name, component);
});
app.config.globalProperties.$message = ElMessage;

app.mount("#app");

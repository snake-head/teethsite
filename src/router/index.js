import { createRouter, createWebHashHistory } from "vue-router";
import Viewer from "../pages/Viewer";
import { DEFAULT_PATIENTUID } from "../static_config";

const routerHistorys = createWebHashHistory();
const router = createRouter({
    history: routerHistorys,
    routes: [
        {
            path: "/",
            redirect: "/Viewer?patientUID=" + DEFAULT_PATIENTUID,
        },
        {
            path: "/Viewer",
            component: Viewer,
            meta: {
                shouldAuth: true,
                title: "数字化精准正畸网页端",
            },
            beforeEnter: (to, from, next) => {
                if (to.query.patientUID) {
                    next();
                } else {
                    // 未传参且不存在cookie
                    alert("无法读取patientUID！");
                }
            },
        },
    ],
});

// router.beforeEach(((to, from, next) => {
//     if (to.meta.shouldAuth) {
//         next()
//     } else {
//         next()
//     }
// }))
router.afterEach((to, from) => {
    document.title = to.meta.title || "--欢迎进入--";
});

export default router;

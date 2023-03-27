import { createStore } from "vuex";
import actorHandleState from "./actorHandleState";
import userHandleState from "./userHandleState";
export default createStore({
    modules: {
        actorHandleState,
        userHandleState,
    },
});

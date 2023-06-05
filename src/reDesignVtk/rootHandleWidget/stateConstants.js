var InteractionState = {
    OUTSIDE: 0,
    NEARBY: 1,
    SELECTING: 2,
    TRANSLATING: 3,
    SCALING: 4,
    SELECTING_ACTOR: 5,
    SELECTING_ACTOR_BOTTOM: 6,
    SELECTING_ACTOR_TOP: 7,
    SELECTING_ACTOR_RADIUS: 8,
    DEFAULT: 9
};
var HandleRepConstants = {
    InteractionState: InteractionState
};

export default HandleRepConstants;
export { InteractionState };

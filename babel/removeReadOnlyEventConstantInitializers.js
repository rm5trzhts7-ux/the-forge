const READ_ONLY_EVENT_CONSTANTS = new Set([
  "NONE",
  "CAPTURING_PHASE",
  "AT_TARGET",
  "BUBBLING_PHASE"
]);

module.exports = function removeReadOnlyEventConstantInitializers() {
  return {
    name: "remove-readonly-event-constant-initializers",
    visitor: {
      Program: {
        exit(programPath, state) {
          const filename = String(state.filename || "");

          if (!filename.endsWith("react-native/src/private/webapis/dom/events/Event.js")) {
            return;
          }

          programPath.traverse({
            ExpressionStatement(path) {
              const expression = path.node.expression;

              if (expression?.type !== "AssignmentExpression") {
                return;
              }

              const left = expression.left;

              if (left.type !== "MemberExpression") {
                return;
              }

              const property = left.property;
              const propertyName =
                property.type === "Identifier"
                  ? property.name
                  : property.type === "StringLiteral"
                    ? property.value
                    : null;

              if (propertyName && READ_ONLY_EVENT_CONSTANTS.has(propertyName)) {
                path.remove();
              }
            }
          });
        }
      }
    }
  };
};

def explain_risk(model, X_sample):
    try:
        import shap
    except Exception:
        print("SHAP not available. Install shap to enable explanations.")
        return {}

    try:
        if hasattr(model, "coef_"):
            explainer = shap.LinearExplainer(model, X_sample)
            shap_values = explainer.shap_values(X_sample)
        else:
            explainer = shap.TreeExplainer(model)
            shap_values = explainer.shap_values(X_sample)
    except Exception:
        print("SHAP explainer failed for this model.")
        return {}

    return {
        feature: float(shap_values[0][i])
        for i, feature in enumerate(X_sample.columns)
    }

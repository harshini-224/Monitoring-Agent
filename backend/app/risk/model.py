from sklearn.linear_model import LogisticRegression


def train_model(X, y):
    model = LogisticRegression(
        max_iter=1000,
        solver="liblinear",
        class_weight="balanced",
        random_state=42
    )
    model.fit(X, y)
    return model

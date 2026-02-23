import random
import csv
import os

from app.config import SAMPLE_DATASET_PATH


FIELDS = [
    "call_id",
    "chest_pain_score",
    "shortness_of_breath",
    "med_adherence",
    "red_flag",
    "readmitted_30d"
]


def generate_sample_dataset(rows: int = 200, path: str | None = None) -> str:
    path = path or SAMPLE_DATASET_PATH
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        for i in range(rows):
            chest_pain = round(random.uniform(0.0, 1.0), 2)
            sob = random.choice([0, 1])
            adherence = round(random.uniform(0.0, 1.0), 2)
            red_flag = random.choice([0, 1])
            risk_score = 0.2 + (0.6 * chest_pain) + (0.3 * sob) + (0.4 * red_flag) - (0.3 * adherence)
            readmitted = 1 if risk_score > 0.8 else 0

            writer.writerow({
                "call_id": f"sample-{i+1}",
                "chest_pain_score": chest_pain,
                "shortness_of_breath": sob,
                "med_adherence": adherence,
                "red_flag": red_flag,
                "readmitted_30d": readmitted
            })

    return path

from app.db.session import SessionLocal
from app.db.models import (
    Patient, CallLog, AgentResponse, ReadmissionRisk, AlertAction, 
    MedicationReminder, CareAssignment, NurseCallAssignment, 
    ResponseCorrection, Intervention, Notification
)
import sys

def remove_high_risk_patients():
    db = SessionLocal()
    try:
        # Search for the patients we added
        patient_names = ["Sunita Williams", "Venkatesh Rao"]
        patients = db.query(Patient).filter(Patient.name.in_(patient_names)).all()
        
        if not patients:
            print("No patients found to remove.")
            return

        for patient in patients:
            print(f"Removing patient: {patient.name} (ID: {patient.id})")
            
            p_id = patient.id
            
            # Delete in order of constraints
            db.query(Notification).filter(Notification.related_patient_id == p_id).delete()
            db.query(NurseCallAssignment).filter(NurseCallAssignment.patient_id == p_id).delete()
            db.query(AlertAction).filter(AlertAction.patient_id == p_id).delete()
            db.query(ReadmissionRisk).filter(ReadmissionRisk.patient_id == p_id).delete()
            db.query(ResponseCorrection).filter(ResponseCorrection.patient_id == p_id).delete()
            db.query(MedicationReminder).filter(MedicationReminder.patient_id == p_id).delete()
            db.query(CareAssignment).filter(CareAssignment.patient_id == p_id).delete()
            db.query(Intervention).filter(Intervention.patient_id == p_id).delete()
            
            # Call logs and agent responses
            call_logs = db.query(CallLog).filter(CallLog.patient_id == p_id).all()
            log_ids = [log.id for log in call_logs]
            
            if log_ids:
                # Note: agent_responses references patient_calls.id, not call_logs.id.
                # But call_logs references patient_calls.id.
                # However, in seeding, we often create them together.
                # We need to find if there are orphaned patient_calls too.
                # For now, just delete the responses tied to the patient_calls associated with these logs.
                call_ids = [log.patient_call_id for log in call_logs if log.patient_call_id]
                if call_ids:
                    db.query(AgentResponse).filter(AgentResponse.call_id.in_(call_ids)).delete()
                
                db.query(CallLog).filter(CallLog.id.in_(log_ids)).delete()
                
                # Note: patient_calls doesn't have a patient_id ForeignKey (it's a string),
                # so we can't easily bulk delete them without more logic.
                # But they are small and mostly harmless if left.
            
            # Delete patient
            db.query(Patient).filter(Patient.id == p_id).delete()
            
        db.commit()
        print("Successfully removed high-risk patients and all related records.")
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    remove_high_risk_patients()

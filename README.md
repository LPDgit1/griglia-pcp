# Griglia PCP

Applicazione per inserire e analizzare Griglie di Repertorio nella cornice della Personal Construct Psychology.

La versione deployabile per GitHub e Streamlit Community Cloud usa:

- `streamlit_app.py` come entrypoint Streamlit.
- `app_static/griglia-pcp/` come sorgente statica dell'interfaccia HTML/CSS/JS.
- `requirements.txt` per le dipendenze.

## Avvio locale

```powershell
python -m pip install -r requirements.txt
streamlit run streamlit_app.py
```

Poi aprire l'indirizzo locale mostrato da Streamlit.

## Pubblicazione su GitHub

1. Creare un nuovo repository GitHub.
2. Caricare questi file e cartelle:
   - `streamlit_app.py`
   - `requirements.txt`
   - `runtime.txt`
   - `.streamlit/config.toml`
   - `app_static/griglia-pcp/`
   - `README.md`
3. Fare commit su `main`.

La cartella `outputs/` non serve per il deploy ed è esclusa da `.gitignore`.

## Pubblicazione su Streamlit Community Cloud

1. Aprire Streamlit Community Cloud.
2. Selezionare **New app**.
3. Scegliere il repository GitHub.
4. Impostare:
   - branch: `main`
   - main file path: `streamlit_app.py`
5. Avviare il deploy.

Non sono richieste variabili segrete o credenziali.

## Nota metodologica

Gli indici dell'area **RG Dynamics** sono operazionalizzazioni quantitative sperimentali del framework fornito dall'utente. Gli indici longitudinali e interpersonali richiederanno una futura estensione dei dati per gestire più griglie nel tempo o più griglie confrontabili.

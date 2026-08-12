# Griglia PCP Standalone per Windows

Questa cartella contiene i sorgenti del pacchetto installabile locale.

L'installer:

- installa l'app in `%LOCALAPPDATA%\Programs\Griglia PCP`;
- crea collegamenti sul Desktop e nel menu Start;
- non richiede Python, Node.js, Streamlit o una connessione Internet;
- apre l'app in una finestra dedicata di Microsoft Edge, oppure nel browser
  predefinito se Edge non e disponibile;
- include un comando di disinstallazione.

## Generazione dell'installer

Da PowerShell, nella radice del progetto:

```powershell
powershell -ExecutionPolicy Bypass -File standalone\build-installer.ps1
```

Il file risultante viene creato in `outputs\standalone`.

L'installer e privo di firma digitale: Windows puo quindi mostrare l'avviso
SmartScreen relativo a un autore non riconosciuto.

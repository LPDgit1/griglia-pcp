# Griglia PCP

MVP locale per l'inserimento e l'analisi esplorativa di Griglie di Repertorio nella Psicologia dei Costrutti Personali.

## Avvio

Aprire `index.html` con un browser moderno. L'applicazione non richiede installazione e salva automaticamente l'ultima griglia nel `localStorage` del browser.

Per servirla in locale da terminale:

```powershell
python -m http.server 4173 --directory outputs/griglia-pcp
```

Poi visitare `http://localhost:4173`.

## Funzioni incluse

- Inserimento e modifica della matrice di punteggi.
- Aggiunta e rimozione di elementi e costrutti bipolari.
- Importazione ed esportazione CSV.
- Backup e ripristino JSON.
- Esportazione dei risultati principali in report Word e PDF dalla sezione Dati.
- Statistiche descrittive e distribuzione dei punteggi.
- Polarizzazione, uso del punto medio, intensità correlazionale, differenziazione di Bieri e differenziazione basata sulle distanze.
- Correlazioni Pearson tra costrutti o elementi.
- PCA esplorativa con autovalori, varianza spiegata, scree plot, mappa degli elementi e carichi.
- Dendrogrammi di elementi o costrutti con legame medio, completo o singolo.
- Sezione **RG Dynamics** con indici sperimentali ispirati al framework allegato:
  - Construct System Entropy.
  - Construct Redundancy Compression Index, a una e due componenti.
  - Construct Orthogonality Index.
  - Construct Load Concentration Index.
  - Centralità, bridge vulnerability, fragilità e instabilità dei costrutti.
  - Geometria del sé, se sono presenti elementi riconoscibili come sé attuale, sé ideale, sé temuto, sé futuro o sguardo esterno.
  - Polarizzazione selettiva per costrutto.
  - Implicative Dilemma Density e matrice del costo di cambiamento.
  - Construct Permeability Potential, Construct Transformation Readiness e Micro-Experiment Suitability Index.
  - Rating inconsistency e dissonanza locale degli elementi.

## Formato CSV

La prima riga contiene due intestazioni per i poli e i nomi degli elementi. Ogni riga successiva contiene i due poli del costrutto e i punteggi.

```csv
polo_sinistro,polo_destro,Io,Partner,Collega ideale
Calmo,Ansioso,2,5,1
Disponibile,Distante,1,4,2
```

## Nota metodologica

Gli indicatori e le visualizzazioni supportano l'esplorazione della griglia; non sostituiscono l'interpretazione professionale. La sezione PCA usa un'estrazione sulle componenti principali dei costrutti centrati e va letta come analisi esplorativa.

Gli indici **RG Dynamics** sono operazionalizzazioni quantitative sperimentali del framework fornito dall'utente. Gli indici longitudinali e interpersonali non sono ancora inclusi, perché richiedono rispettivamente più griglie nel tempo o più griglie confrontabili.

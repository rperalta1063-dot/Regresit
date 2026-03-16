/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  Play, 
  BarChart3, 
  Table as TableIcon, 
  Search, 
  Zap, 
  FileText, 
  AlertCircle,
  CheckCircle2,
  Loader2,
  ChevronRight,
  Database,
  Sun,
  Moon,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ScatterChart, 
  Scatter, 
  XAxis, 
  YAxis, 
  ZAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Line,
  ComposedChart,
  Legend,
  ReferenceArea
} from 'recharts';

// --- Types ---
interface ModelResults {
  params: Record<string, number>;
  bse: Record<string, number>;
  pvalues: Record<string, number>;
  conf_int: Record<string, [number, number]>;
  rsquared: number;
  rsquared_adj: number;
  fvalue: number;
  f_pvalue: number;
  aic: number;
  bic: number;
  x_names: string[];
  y_name: string;
  vif: { Variable: string[]; VIF: number[] } | null;
}

// --- Components ---

const TabButton = ({ active, onClick, icon: Icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all border-b-2 ${
      active 
        ? 'border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100' 
        : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-200 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:border-zinc-800'
    }`}
  >
    <Icon size={16} />
    {label}
  </button>
);

export default function App() {
  const [pyodide, setPyodide] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<{ type: 'info' | 'success' | 'error', message: string }>({ type: 'info', message: 'Inicializando Pyodide...' });
  const [columns, setColumns] = useState<string[]>([]);
  const [dataPreview, setDataPreview] = useState<string>('');
  const [missingInfo, setMissingInfo] = useState<string>('');
  const [descStats, setDescStats] = useState<string>('');
  const [corrMatrix, setCorrMatrix] = useState<string>('');
  const [outliers, setOutliers] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'data' | 'eda' | 'viz' | 'results' | 'diagnostics' | 'predict'>('data');
  
  const [selectedY, setSelectedY] = useState<string>('');
  const [selectedX, setSelectedX] = useState<string[]>([]);
  const [vizX, setVizX] = useState<string>('');
  const [vizY, setVizY] = useState<string>('');
  const [scatterPlot, setScatterPlot] = useState<string>('');
  const [modelResults, setModelResults] = useState<ModelResults | null>(null);
  const [diagPlot, setDiagPlot] = useState<string>('');
  const [predictionInputs, setPredictionInputs] = useState<Record<string, string>>({});
  const [predictionOutput, setPredictionOutput] = useState<string>('');
  const [scatterData, setScatterData] = useState<any[]>([]);
  const [regressionData, setRegressionData] = useState<any[]>([]);
  const [zoomArea, setZoomArea] = useState<{ x1: number | string | null, y1: number | string | null, x2: number | string | null, y2: number | string | null }>({ x1: null, y1: null, x2: null, y2: null });
  const [chartDomain, setChartDomain] = useState<{ x: [any, any], y: [any, any] }>({ x: ['dataMin', 'dataMax'], y: ['dataMin', 'dataMax'] });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  // Initialize Pyodide
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  useEffect(() => {
    const init = async () => {
      try {
        // @ts-ignore
        const py = await window.loadPyodide({
          indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/"
        });
        await py.loadPackage(['pandas', 'numpy', 'statsmodels', 'matplotlib', 'scipy', 'scikit-learn', 'micropip']);
        await py.runPythonAsync(`
          import micropip
          await micropip.install('openpyxl')
          import matplotlib
          matplotlib.use('Agg')
          import pandas as pd
          import numpy as np
          import statsmodels.api as sm
          from statsmodels.stats.outliers_influence import variance_inflation_factor
          import io
          import base64
          import matplotlib.pyplot as plt
          import json
        `);
        setPyodide(py);
        setIsLoading(false);
        setStatus({ type: 'success', message: 'Sistema listo. Cargue datos para comenzar.' });
      } catch (err: any) {
        console.error(err);
        setStatus({ type: 'error', message: `Error al cargar Pyodide: ${err.message}` });
      }
    };

    // Load script dynamically
    const script = document.createElement('script');
    script.src = "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js";
    script.onload = init;
    document.head.appendChild(script);
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const reader = new FileReader();
    
    reader.onload = async (event) => {
      const data = event.target?.result;
      if (isExcel) {
        await loadExcelData(data as ArrayBuffer);
      } else {
        await loadData(data as string);
      }
    };

    if (isExcel) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };

  const loadExcelData = async (buffer: ArrayBuffer) => {
    if (!pyodide) return;
    setIsLoading(true);
    setStatus({ type: 'info', message: 'Procesando archivo Excel...' });
    try {
      const uint8Array = new Uint8Array(buffer);
      pyodide.globals.set('excel_bytes', uint8Array);
      await pyodide.runPythonAsync(`
        import pandas as pd
        import io
        df = pd.read_excel(io.BytesIO(excel_bytes.to_py()))
        globals()['df'] = df
      `);
      await updateDataInfo();
      setStatus({ type: 'success', message: 'Excel cargado correctamente.' });
      setActiveTab('data');
    } catch (err: any) {
      console.error(err);
      setStatus({ type: 'error', message: `Error al cargar Excel: ${err.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const loadData = async (csvString: string) => {
    if (!pyodide) return;
    setIsLoading(true);
    setStatus({ type: 'info', message: 'Cargando dataset...' });
    try {
      // Pass data safely using globals.set instead of string interpolation
      pyodide.globals.set('csv_raw_data', csvString);
      await pyodide.runPythonAsync(`
        import pandas as pd
        import io
        df = pd.read_csv(io.StringIO(csv_raw_data))
        # Ensure df is in global scope
        globals()['df'] = df
      `);
      await updateDataInfo();
      setStatus({ type: 'success', message: 'Datos cargados correctamente.' });
      setActiveTab('data');
    } catch (err: any) {
      console.error(err);
      setStatus({ type: 'error', message: `Error de carga: ${err.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const loadExample = async (type: 'iris' | 'mtcars') => {
    if (!pyodide) return;
    setIsLoading(true);
    setStatus({ type: 'info', message: `Cargando dataset ${type}...` });
    try {
      if (type === 'iris') {
        await pyodide.runPythonAsync(`
          from sklearn.datasets import load_iris
          iris = load_iris()
          df = pd.DataFrame(iris.data, columns=iris.feature_names)
          df['target'] = iris.target
          globals()['df'] = df
        `);
      } else {
        await pyodide.runPythonAsync(`
          from pyodide.http import pyfetch
          import io
          
          # Fetch mtcars directly from Rdatasets repository
          url = "https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/datasets/mtcars.csv"
          response = await pyfetch(url)
          if response.status == 200:
              csv_content = await response.string()
              df = pd.read_csv(io.StringIO(csv_content))
              # Clean up the first column which contains car names
              if 'Unnamed: 0' in df.columns:
                  df = df.rename(columns={'Unnamed: 0': 'model'})
              globals()['df'] = df
          else:
              raise Exception(f"Error al descargar mtcars: {response.status}")
        `);
      }
      await updateDataInfo();
      setStatus({ type: 'success', message: `Dataset ${type} cargado.` });
      setActiveTab('data');
    } catch (err: any) {
      console.error(err);
      setStatus({ type: 'error', message: `Error al cargar ejemplo: ${err.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const updateDataInfo = async () => {
    // Verify df exists before proceeding
    const dfExists = await pyodide.runPythonAsync("'df' in globals()");
    if (!dfExists) throw new Error("DataFrame 'df' no encontrado en el entorno de Python.");

    const cols = await pyodide.runPythonAsync(`
      num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
      num_cols
    `);
    const colList = cols.toJs();
    setColumns(colList);
    setSelectedY(colList[0] || '');
    setSelectedX([]);
    setVizX(colList[0] || '');
    setVizY(colList[1] || colList[0] || '');

    const preview = await pyodide.runPythonAsync(`df.head(10).to_html(classes='table')`);
    setDataPreview(preview);

    const missing = await pyodide.runPythonAsync(`
      m = df.isnull().sum()
      m = m[m>0]
      m.to_frame().to_html(classes='table') if len(m) > 0 else ""
    `);
    setMissingInfo(missing);

    const stats = await pyodide.runPythonAsync(`df.describe().to_html(classes='table')`);
    setDescStats(stats);

    if (colList.length >= 2) {
      const corr = await pyodide.runPythonAsync(`df[${JSON.stringify(colList)}].corr().round(2).to_html(classes='table')`);
      setCorrMatrix(corr);
    }

    let outlierText = "";
    for (const col of colList) {
      const out = await pyodide.runPythonAsync(`
        Q1 = df['${col}'].quantile(0.25)
        Q3 = df['${col}'].quantile(0.75)
        IQR = Q3 - Q1
        lower = Q1 - 1.5*IQR
        upper = Q3 + 1.5*IQR
        outliers_count = len(df[(df['${col}'] < lower) | (df['${col}'] > upper)])
        f"{outliers_count} valores atípicos detectados en ${col} (Límites: {lower:.2f}, {upper:.2f})"
      `);
      outlierText += `<p class="mb-1">${out}</p>`;
    }
    setOutliers(outlierText);
  };

  const runRegression = async () => {
    if (!selectedY || selectedX.length === 0) {
      setStatus({ type: 'error', message: 'Por favor seleccione Y y al menos una variable X.' });
      return;
    }
    
    // Safety check: verify df exists in Python
    const dfExists = await pyodide.runPythonAsync("'df' in globals()");
    if (!dfExists) {
      setStatus({ type: 'error', message: "Datos perdidos en el entorno de Python. Por favor recargue el dataset." });
      return;
    }

    setIsLoading(true);
    setStatus({ type: 'info', message: 'Calculando modelo OLS...' });
    try {
      await pyodide.runPythonAsync(`
        X = df[${JSON.stringify(selectedX)}]
        y = df['${selectedY}']
        data = pd.concat([X, y], axis=1).dropna()
        X_clean = data.iloc[:, :-1]
        y_clean = data.iloc[:, -1]
        X_with_const = sm.add_constant(X_clean)
        model = sm.OLS(y_clean, X_with_const).fit()
        
        results = {
          'params': model.params.to_dict(),
          'bse': model.bse.to_dict(),
          'pvalues': model.pvalues.to_dict(),
          'conf_int': {idx: row.tolist() for idx, row in model.conf_int().iterrows()},
          'rsquared': model.rsquared,
          'rsquared_adj': model.rsquared_adj,
          'fvalue': model.fvalue,
          'f_pvalue': model.f_pvalue,
          'aic': model.aic,
          'bic': model.bic,
          'x_names': X_clean.columns.tolist(),
          'y_name': '${selectedY}',
          'fittedvalues': model.fittedvalues.tolist(),
          'resid': model.resid.tolist()
        }
        
        if len(X_clean.columns) > 1:
          # Include constant for accurate VIF calculation
          X_vif = sm.add_constant(X_clean)
          vifs = [variance_inflation_factor(X_vif.values, i) for i in range(X_vif.shape[1])]
          vif_df = pd.DataFrame({
            "Variable": X_vif.columns,
            "VIF": vifs
          })
          # Filter out the constant for display
          vif_df = vif_df[vif_df["Variable"] != "const"]
          results['vif'] = vif_df.to_dict(orient='list')
        else:
          results['vif'] = None
        
        # Ensure results is global for subsequent calls
        globals()['results'] = results
        globals()['model'] = model
      `);
      const res = pyodide.globals.get('results').toJs();
      setModelResults(res);
      
      // Generate plot
      await pyodide.runPythonAsync(`
        plt.figure(figsize=(10, 4))
        plt.subplot(1, 2, 1)
        plt.scatter(results['fittedvalues'], results['resid'], alpha=0.5, edgecolors='w')
        plt.axhline(y=0, color='r', linestyle='--')
        plt.xlabel('Valores Ajustados')
        plt.ylabel('Residuos')
        plt.title('Residuos vs Ajustados')
        
        plt.subplot(1, 2, 2)
        from scipy import stats
        stats.probplot(results['resid'], dist="norm", plot=plt)
        plt.title('Q-Q Normal')
        
        plt.tight_layout()
        buf = io.BytesIO()
        plt.savefig(buf, format='png')
        buf.seek(0)
        img_base64 = base64.b64encode(buf.read()).decode('utf-8')
        plt.clf()
        plt.close('all')
      `);
      setDiagPlot(pyodide.globals.get('img_base64'));

      // Prepare prediction inputs
      const initialInputs: Record<string, string> = {};
      for (const x of res.x_names) {
        const mean = await pyodide.runPythonAsync(`df['${x}'].mean()`);
        initialInputs[x] = mean.toFixed(2);
      }
      setPredictionInputs(initialInputs);

      setStatus({ type: 'success', message: 'Modelo calculado correctamente.' });
      setActiveTab('results');
    } catch (err: any) {
      setStatus({ type: 'error', message: `Error de regresión: ${err.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const predict = async () => {
    if (!modelResults) return;
    setIsLoading(true);
    try {
      const vals = modelResults.x_names.map(x => {
        const val = parseFloat(predictionInputs[x]);
        return isNaN(val) ? 0 : val;
      });
      await pyodide.runPythonAsync(`
        new_X = np.array(${JSON.stringify(vals)}).reshape(1, -1)
        new_X_df = pd.DataFrame(new_X, columns=results['x_names'])
        new_X_const = sm.add_constant(new_X_df, has_constant='add')
        
        # Re-fit for prediction intervals (using clean data from previous step)
        X_clean = pd.DataFrame(results['fittedvalues'], columns=['dummy']) # not used, just to show logic
        # We use the existing model object in python
        pred = model.get_prediction(new_X_const)
        pred_mean = float(pred.predicted_mean[0])
        conf_int = pred.conf_int()[0].tolist()
        pred_int = pred.conf_int(obs=True)[0].tolist()
        
        globals()['pred_mean'] = pred_mean
        globals()['conf_int'] = conf_int
        globals()['pred_int'] = pred_int
      `);
      const mean = pyodide.globals.get('pred_mean');
      const ci = pyodide.globals.get('conf_int').toJs();
      const pi = pyodide.globals.get('pred_int').toJs();
      
      if (mean === undefined || !ci || !pi) {
        throw new Error("No se pudieron obtener los resultados de la predicción.");
      }
      
      setPredictionOutput(`
        <div class="space-y-4">
          <div class="p-4 bg-zinc-900 dark:bg-zinc-800 text-white rounded-xl transition-colors">
            <div class="text-xs uppercase tracking-widest opacity-60 mb-1">Predicción Puntual</div>
            <div class="text-3xl font-bold">${mean.toFixed(4)}</div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-xl transition-colors">
              <div class="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1">Intervalo de Confianza (95%)</div>
              <div class="text-sm font-mono dark:text-zinc-200">[${ci[0]?.toFixed(4) || 'N/A'}, ${ci[1]?.toFixed(4) || 'N/A'}]</div>
            </div>
            <div class="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-xl transition-colors">
              <div class="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1">Intervalo de Predicción (95%)</div>
              <div class="text-sm font-mono dark:text-zinc-200">[${pi[0]?.toFixed(4) || 'N/A'}, ${pi[1]?.toFixed(4) || 'N/A'}]</div>
            </div>
          </div>
        </div>
      `);
    } catch (err: any) {
      setStatus({ type: 'error', message: `Error de predicción: ${err.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const generateScatterPlot = async () => {
    if (!vizX || !vizY || !pyodide) return;
    setIsLoading(true);
    try {
      const dataJson = await pyodide.runPythonAsync(`
        import json
        # Extract data for scatter plot
        plot_df = df[['${vizX}', '${vizY}']].dropna()
        scatter_points = plot_df.to_dict(orient='records')
        
        # Calculate regression line
        from sklearn.linear_model import LinearRegression
        x_reg = plot_df['${vizX}'].values.reshape(-1, 1)
        y_reg = plot_df['${vizY}'].values
        reg = LinearRegression().fit(x_reg, y_reg)
        
        # Generate two points for the line (min and max x)
        x_min = float(plot_df['${vizX}'].min())
        x_max = float(plot_df['${vizX}'].max())
        y_min = float(reg.predict([[x_min]])[0])
        y_max = float(reg.predict([[x_max]])[0])
        
        regression_line = [
          {'${vizX}': x_min, '${vizY}': y_min},
          {'${vizX}': x_max, '${vizY}': y_max}
        ]
        
        json.dumps({
          'scatter': scatter_points,
          'regression': regression_line
        })
      `);
      const parsed = JSON.parse(dataJson);
      setScatterData(parsed.scatter);
      setRegressionData(parsed.regression);
      setChartDomain({ x: ['dataMin', 'dataMax'], y: ['dataMin', 'dataMax'] });
      setScatterPlot('interactive');
    } catch (err: any) {
      setStatus({ type: 'error', message: `Error al generar gráfico: ${err.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const handleZoom = () => {
    let { x1, x2, y1, y2 } = zoomArea;

    if (x1 === null || x2 === null || x1 === x2) {
      setZoomArea({ x1: null, y1: null, x2: null, y2: null });
      return;
    }

    if (typeof x1 === 'number' && typeof x2 === 'number' && x1 > x2) [x1, x2] = [x2, x1];
    if (typeof y1 === 'number' && typeof y2 === 'number' && y1 > y2) [y1, y2] = [y2, y1];

    setChartDomain({
      x: [x1, x2],
      y: y1 !== null && y2 !== null ? [y1, y2] : ['dataMin', 'dataMax'],
    });
    setZoomArea({ x1: null, y1: null, x2: null, y2: null });
  };

  const resetZoom = () => {
    setChartDomain({ x: ['dataMin', 'dataMax'], y: ['dataMin', 'dataMax'] });
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950 transition-colors duration-300">
      {/* Header */}
      <header className="h-16 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between px-6 sticky top-0 z-10 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-zinc-900 dark:bg-zinc-100 rounded-lg flex items-center justify-center text-white dark:text-zinc-900">
            <BarChart3 size={20} />
          </div>
          <h1 className="font-bold text-lg tracking-tight dark:text-zinc-100">RegresApp AI</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition-colors"
            title={isDarkMode ? "Modo Claro" : "Modo Oscuro"}
          >
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
            status.type === 'success' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 
            status.type === 'error' ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' : 
            'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
          }`}>
            {status.type === 'success' ? <CheckCircle2 size={14} /> : 
             status.type === 'error' ? <AlertCircle size={14} /> : <Loader2 size={14} className="animate-spin" />}
            {status.message}
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-y-auto p-6 flex flex-col gap-8 transition-colors">
          <section>
            <h3 className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-4">1. Origen de Datos</h3>
            <div className="space-y-3">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
              >
                <Upload size={16} />
                Subir CSV / Excel
              </button>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv,.xlsx,.xls" className="hidden" />
              
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => loadExample('iris')}
                  className="flex items-center justify-center gap-2 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 dark:text-zinc-300 transition-colors"
                >
                  <Database size={14} />
                  Iris
                </button>
                <button 
                  onClick={() => loadExample('mtcars')}
                  className="flex items-center justify-center gap-2 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 dark:text-zinc-300 transition-colors"
                >
                  <Database size={14} />
                  mtcars
                </button>
              </div>
            </div>
          </section>

          <section className={columns.length === 0 ? 'opacity-30 pointer-events-none' : ''}>
            <h3 className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-4">2. Variables</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1.5 block">Dependiente (Y)</label>
                <select 
                  value={selectedY}
                  onChange={(e) => setSelectedY(e.target.value)}
                  className="w-full p-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:text-zinc-200"
                >
                  {columns.map(col => <option key={col} value={col}>{col}</option>)}
                </select>
              </div>
              
              <div>
                <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1.5 block">Independientes (X)</label>
                <div className="max-h-48 overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-800 p-2 space-y-1">
                  {columns.map(col => (
                    <label key={col} className="flex items-center gap-2 p-1.5 hover:bg-white dark:hover:bg-zinc-700 rounded transition-colors cursor-pointer text-sm dark:text-zinc-300">
                      <input 
                        type="checkbox" 
                        checked={selectedX.includes(col)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedX([...selectedX, col]);
                          else setSelectedX(selectedX.filter(x => x !== col));
                        }}
                        className="rounded border-zinc-300 dark:border-zinc-600 text-zinc-900 dark:text-zinc-100 focus:ring-zinc-900 dark:bg-zinc-900"
                      />
                      {col}
                    </label>
                  ))}
                </div>
              </div>

              <button 
                onClick={runRegression}
                disabled={isLoading || selectedX.length === 0}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                Ejecutar Análisis
              </button>
            </div>
          </section>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs */}
          <nav className="flex px-6 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 transition-colors">
            <TabButton active={activeTab === 'data'} onClick={() => setActiveTab('data')} icon={TableIcon} label="Vista Previa" />
            <TabButton active={activeTab === 'eda'} onClick={() => setActiveTab('eda')} icon={Search} label="Exploración" />
            <TabButton active={activeTab === 'viz'} onClick={() => setActiveTab('viz')} icon={BarChart3} label="Visualización" />
            <TabButton active={activeTab === 'results'} onClick={() => setActiveTab('results')} icon={Zap} label="Resultados" />
            <TabButton active={activeTab === 'diagnostics'} onClick={() => setActiveTab('diagnostics')} icon={BarChart3} label="Diagnóstico" />
            <TabButton active={activeTab === 'predict'} onClick={() => setActiveTab('predict')} icon={FileText} label="Predicción" />
          </nav>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-8 bg-zinc-50 dark:bg-zinc-950 transition-colors">
            <AnimatePresence mode="wait">
              {activeTab === 'data' && (
                <motion.div 
                  key="data"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-8"
                >
                  {dataPreview ? (
                    <>
                      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden transition-colors">
                        <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                          <h2 className="font-bold text-zinc-900 dark:text-zinc-100">Vista Previa del Dataset (Top 10)</h2>
                          <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">n = {columns.length > 0 ? '...' : 0} filas</span>
                        </div>
                        <div className="overflow-x-auto data-table-container" dangerouslySetInnerHTML={{ __html: dataPreview }} />
                      </div>
                      {missingInfo && (
                        <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 rounded-2xl p-6 transition-colors">
                          <h3 className="text-rose-900 dark:text-rose-100 font-bold mb-4 flex items-center gap-2">
                            <AlertCircle size={18} />
                            Valores Faltantes Detectados
                          </h3>
                          <div className="data-table-container" dangerouslySetInnerHTML={{ __html: missingInfo }} />
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="h-64 flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-600 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl transition-colors">
                      <Database size={48} className="mb-4 opacity-20" />
                      <p className="text-sm">No hay datos cargados. Suba un CSV o cargue un ejemplo.</p>
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === 'eda' && (
                <motion.div 
                  key="eda"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-8"
                >
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden transition-colors">
                      <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
                        <h2 className="font-bold text-zinc-900 dark:text-zinc-100">Estadísticas Descriptivas</h2>
                      </div>
                      <div className="overflow-x-auto data-table-container" dangerouslySetInnerHTML={{ __html: descStats }} />
                    </div>
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden transition-colors">
                      <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
                        <h2 className="font-bold text-zinc-900 dark:text-zinc-100">Matriz de Correlación</h2>
                      </div>
                      <div className="overflow-x-auto data-table-container" dangerouslySetInnerHTML={{ __html: corrMatrix }} />
                    </div>
                  </div>
                  <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6 transition-colors">
                    <h2 className="font-bold text-zinc-900 dark:text-zinc-100 mb-4">Análisis de Outliers (Método IQR)</h2>
                    <div className="text-sm text-zinc-600 dark:text-zinc-400" dangerouslySetInnerHTML={{ __html: outliers }} />
                  </div>
                </motion.div>
              )}

              {activeTab === 'viz' && (
                <motion.div 
                  key="viz"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-8"
                >
                  <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6 transition-colors">
                    <div className="flex flex-col md:flex-row gap-6 items-end mb-8">
                      <div className="flex-1">
                        <label className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-2 block">Eje X</label>
                        <select 
                          value={vizX}
                          onChange={(e) => setVizX(e.target.value)}
                          className="w-full p-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:text-zinc-200"
                        >
                          {columns.map(col => <option key={col} value={col}>{col}</option>)}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-2 block">Eje Y</label>
                        <select 
                          value={vizY}
                          onChange={(e) => setVizY(e.target.value)}
                          className="w-full p-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:text-zinc-200"
                        >
                          {columns.map(col => <option key={col} value={col}>{col}</option>)}
                        </select>
                      </div>
                      <button 
                        onClick={generateScatterPlot}
                        disabled={isLoading || columns.length === 0}
                        className="px-6 py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 transition-all flex items-center gap-2"
                      >
                        {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                        Generar Gráfico
                      </button>
                    </div>

                    {scatterPlot === 'interactive' ? (
                      <div className="space-y-4">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={resetZoom}
                            className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors flex items-center gap-1 text-xs font-medium"
                            title="Resetear Zoom"
                          >
                            <RefreshCw size={14} />
                            Resetear Zoom
                          </button>
                        </div>
                        <div className="h-[500px] w-full select-none">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart
                              margin={{ top: 20, right: 20, bottom: 40, left: 40 }}
                              onMouseDown={(e: any) => e && setZoomArea({ ...zoomArea, x1: e.activeLabel, y1: e.activePayload?.[0]?.value })}
                              onMouseMove={(e: any) => e && zoomArea.x1 !== null && setZoomArea({ ...zoomArea, x2: e.activeLabel, y2: e.activePayload?.[0]?.value })}
                              onMouseUp={handleZoom}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#27272a' : '#f4f4f5'} vertical={false} />
                              <XAxis 
                                dataKey={vizX} 
                                type="number" 
                                name={vizX} 
                                domain={chartDomain.x} 
                                tick={{ fill: isDarkMode ? '#71717a' : '#a1a1aa', fontSize: 11 }}
                                label={{ value: vizX, position: 'bottom', offset: 20, fill: isDarkMode ? '#a1a1aa' : '#71717a', fontSize: 12, fontWeight: 600 }}
                                allowDataOverflow
                              />
                              <YAxis 
                                type="number" 
                                name={vizY} 
                                domain={chartDomain.y}
                                tick={{ fill: isDarkMode ? '#71717a' : '#a1a1aa', fontSize: 11 }}
                                label={{ value: vizY, angle: -90, position: 'insideLeft', offset: -20, fill: isDarkMode ? '#a1a1aa' : '#71717a', fontSize: 12, fontWeight: 600 }}
                                allowDataOverflow
                              />
                              <Tooltip 
                                cursor={{ strokeDasharray: '3 3' }}
                                contentStyle={{ 
                                  backgroundColor: isDarkMode ? '#18181b' : '#ffffff', 
                                  borderColor: isDarkMode ? '#27272a' : '#e4e4e7',
                                  color: isDarkMode ? '#f4f4f5' : '#18181b',
                                  borderRadius: '12px',
                                  fontSize: '12px',
                                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'
                                }} 
                                itemStyle={{ padding: '2px 0' }}
                              />
                              <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}/>
                              <Scatter name="Datos" data={scatterData} fill="#3b82f6" fillOpacity={0.6} />
                              <Line 
                                name="Tendencia Lineal" 
                                data={regressionData} 
                                type="monotone" 
                                dataKey={vizY} 
                                stroke="#ef4444" 
                                strokeWidth={2} 
                                dot={false} 
                                activeDot={false}
                                isAnimationActive={false}
                              />
                              {zoomArea.x1 !== null && zoomArea.x2 !== null && (
                                <ReferenceArea 
                                  x1={zoomArea.x1} 
                                  x2={zoomArea.x2} 
                                  {...({ fill: "#3b82f6", fillOpacity: 0.1 } as any)}
                                />
                              )}
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex items-center justify-center gap-4">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                            <span className="text-[10px] text-zinc-400 uppercase tracking-widest">Puntos de Datos</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-4 h-0.5 bg-red-500"></div>
                            <span className="text-[10px] text-zinc-400 uppercase tracking-widest">Línea de Regresión</span>
                          </div>
                        </div>
                        <p className="text-[10px] text-zinc-400 text-center uppercase tracking-widest mt-2 opacity-60">
                          Arrastra horizontalmente para hacer zoom • Haz clic en Resetear para volver
                        </p>
                      </div>
                    ) : scatterPlot ? (
                      <div className="flex justify-center">
                        <img src={`data:image/png;base64,${scatterPlot}`} alt="Gráfico de Dispersión" className="max-w-full h-auto rounded-xl shadow-sm border border-zinc-100 dark:border-zinc-800" />
                      </div>
                    ) : (
                      <div className="h-96 flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-600 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl transition-colors">
                        <BarChart3 size={48} className="mb-4 opacity-20" />
                        <p className="text-sm">Seleccione las variables y haga clic en "Generar Gráfico".</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {activeTab === 'results' && (
                <motion.div 
                  key="results"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-8"
                >
                  {modelResults ? (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        <div className="metric-card">
                          <span className="metric-value">{(modelResults.rsquared * 100).toFixed(1)}%</span>
                          <span className="metric-label">R-Cuadrado</span>
                        </div>
                        <div className="metric-card">
                          <span className="metric-value">{(modelResults.rsquared_adj * 100).toFixed(1)}%</span>
                          <span className="metric-label">R-Cuadrado Adj.</span>
                        </div>
                        <div className="metric-card">
                          <span className="metric-value">{modelResults.fvalue.toFixed(2)}</span>
                          <span className="metric-label">Estadístico F</span>
                        </div>
                        <div className="metric-card">
                          <span className="metric-value">{modelResults.f_pvalue.toFixed(4)}</span>
                          <span className="metric-label">Prob (F)</span>
                        </div>
                        <div className="metric-card">
                          <span className="metric-value">{modelResults.aic.toFixed(1)}</span>
                          <span className="metric-label">AIC</span>
                        </div>
                        <div className="metric-card">
                          <span className="metric-value">{modelResults.bic.toFixed(1)}</span>
                          <span className="metric-label">BIC</span>
                        </div>
                      </div>

                      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden transition-colors">
                        <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
                          <h2 className="font-bold text-zinc-900 dark:text-zinc-100">Coeficientes del Modelo</h2>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm text-left border-collapse">
                            <thead>
                              <tr className="bg-zinc-50 dark:bg-zinc-950/50">
                                <th className="p-3 border-b border-zinc-200 dark:border-zinc-800 dark:text-zinc-300">Variable</th>
                                <th className="p-3 border-b border-zinc-200 dark:border-zinc-800 dark:text-zinc-300">Coeficiente</th>
                                <th className="p-3 border-b border-zinc-200 dark:border-zinc-800 dark:text-zinc-300">Error Est.</th>
                                <th className="p-3 border-b border-zinc-200 dark:border-zinc-800 dark:text-zinc-300">Estadístico t</th>
                                <th className="p-3 border-b border-zinc-200 dark:border-zinc-800 dark:text-zinc-300">P-value</th>
                                <th className="p-3 border-b border-zinc-200 dark:border-zinc-800 dark:text-zinc-300">IC 95%</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td className="p-3 border-b border-zinc-100 dark:border-zinc-900 font-medium dark:text-zinc-300">const (Intercepto)</td>
                                <td className="p-3 border-b border-zinc-100 dark:border-zinc-900 font-mono dark:text-zinc-200">{modelResults.params.const?.toFixed(4) || 'N/A'}</td>
                                <td className="p-3 border-b border-zinc-100 dark:border-zinc-900 font-mono text-zinc-500 dark:text-zinc-500">{modelResults.bse.const?.toFixed(4) || 'N/A'}</td>
                                <td className="p-3 border-b border-zinc-100 dark:border-zinc-900 font-mono dark:text-zinc-300">{(modelResults.params.const && modelResults.bse.const) ? (modelResults.params.const / modelResults.bse.const).toFixed(3) : 'N/A'}</td>
                                <td className="p-3 border-b border-zinc-100 dark:border-zinc-900 font-mono">
                                  <span className={modelResults.pvalues.const < 0.05 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'dark:text-zinc-300'}>
                                    {modelResults.pvalues.const?.toFixed(4) || 'N/A'}
                                  </span>
                                </td>
                                <td className="p-3 border-b border-zinc-100 dark:border-zinc-900 font-mono text-zinc-500 dark:text-zinc-400">
                                  [{modelResults.conf_int.const?.[0]?.toFixed(3) || 'N/A'}, {modelResults.conf_int.const?.[1]?.toFixed(3) || 'N/A'}]
                                </td>
                              </tr>
                              {modelResults.x_names.map(x => (
                                <tr key={x}>
                                  <td className="p-3 border-b border-zinc-100 dark:border-zinc-900 font-medium dark:text-zinc-300">{x}</td>
                                  <td className="p-3 border-b border-zinc-100 dark:border-zinc-900 font-mono dark:text-zinc-200">{modelResults.params[x]?.toFixed(4) || 'N/A'}</td>
                                  <td className="p-3 border-b border-zinc-100 dark:border-zinc-900 font-mono text-zinc-500 dark:text-zinc-500">{modelResults.bse[x]?.toFixed(4) || 'N/A'}</td>
                                  <td className="p-3 border-b border-zinc-100 dark:border-zinc-900 font-mono dark:text-zinc-300">{(modelResults.params[x] && modelResults.bse[x]) ? (modelResults.params[x] / modelResults.bse[x]).toFixed(3) : 'N/A'}</td>
                                  <td className="p-3 border-b border-zinc-100 dark:border-zinc-900 font-mono">
                                    <span className={modelResults.pvalues[x] < 0.05 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'dark:text-zinc-300'}>
                                      {modelResults.pvalues[x]?.toFixed(4) || 'N/A'}
                                    </span>
                                  </td>
                                  <td className="p-3 border-b border-zinc-100 dark:border-zinc-900 font-mono text-zinc-500 dark:text-zinc-400">
                                    [{modelResults.conf_int[x]?.[0]?.toFixed(3) || 'N/A'}, {modelResults.conf_int[x]?.[1]?.toFixed(3) || 'N/A'}]
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="bg-zinc-900 dark:bg-zinc-800 text-white p-6 rounded-2xl shadow-lg transition-colors">
                        <h3 className="text-xs font-bold uppercase tracking-widest opacity-50 mb-4">Interpretación Automática</h3>
                        <div className="space-y-4">
                          <p className="text-lg leading-relaxed">
                            El modelo explica un <span className="text-emerald-400 font-bold">{(modelResults.rsquared * 100).toFixed(1)}%</span> de la variabilidad de <strong>{modelResults.y_name}</strong>. 
                            {modelResults.f_pvalue < 0.05 
                              ? " La relación general es estadísticamente sólida (p < 0.05)." 
                              : " La relación general no alcanza significancia estadística."}
                          </p>
                          
                          <div className="text-sm opacity-90 space-y-2">
                            {modelResults.x_names.filter(x => modelResults.pvalues[x] < 0.05).length > 0 ? (
                              <div>
                                <p className="font-semibold mb-1 text-zinc-300">Variables Significativas:</p>
                                <ul className="list-disc list-inside space-y-1">
                                  {modelResults.x_names.filter(x => modelResults.pvalues[x] < 0.05).map(x => (
                                    <li key={x}>
                                      <span className="font-mono text-blue-300">{x}</span>: 
                                      {modelResults.params[x] > 0 
                                        ? " Por cada unidad que aumenta, la variable dependiente tiende a subir." 
                                        : " Por cada unidad que aumenta, la variable dependiente tiende a bajar."}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : (
                              <p className="italic text-zinc-400">No se detectaron variables individuales con impacto estadísticamente significativo.</p>
                            )}
                            <p className="text-[10px] uppercase tracking-wider opacity-50 pt-2">
                              AIC: {modelResults.aic.toFixed(2)} | BIC: {modelResults.bic.toFixed(2)} | R² Adj: {(modelResults.rsquared_adj * 100).toFixed(1)}%
                            </p>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="h-64 flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-600 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl transition-colors">
                      <Zap size={48} className="mb-4 opacity-20" />
                      <p className="text-sm">Ejecute el análisis para ver los resultados estadísticos.</p>
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === 'diagnostics' && (
                <motion.div 
                  key="diagnostics"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-8"
                >
                  {diagPlot ? (
                    <>
                      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6 transition-colors">
                        <h2 className="font-bold text-zinc-900 dark:text-zinc-100 mb-6">Visualizaciones de Diagnóstico</h2>
                        <img src={`data:image/png;base64,${diagPlot}`} alt="Diagnóstico" className="w-full h-auto rounded-xl border border-zinc-100 dark:border-zinc-800" />
                      </div>
                      
                      {modelResults?.vif && (
                        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden transition-colors">
                          <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
                            <h2 className="font-bold text-zinc-900 dark:text-zinc-100">Multicolinealidad (VIF)</h2>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left border-collapse">
                              <thead>
                                <tr className="bg-zinc-50 dark:bg-zinc-950/50">
                                  <th className="p-3 border-b border-zinc-200 dark:border-zinc-800 dark:text-zinc-300">Variable</th>
                                  <th className="p-3 border-b border-zinc-200 dark:border-zinc-800 dark:text-zinc-300">VIF</th>
                                  <th className="p-3 border-b border-zinc-200 dark:border-zinc-800 dark:text-zinc-300">Estado</th>
                                </tr>
                              </thead>
                              <tbody>
                                  {modelResults.vif.Variable.map((v, i) => {
                                    const vifVal = modelResults.vif?.VIF?.[i];
                                    return (
                                      <tr key={v}>
                                        <td className="p-3 border-b border-zinc-100 dark:border-zinc-900 font-medium dark:text-zinc-300">{v}</td>
                                        <td className="p-3 border-b border-zinc-100 dark:border-zinc-900 font-mono dark:text-zinc-200">{vifVal !== undefined ? vifVal.toFixed(2) : 'N/A'}</td>
                                        <td className="p-3 border-b border-zinc-100 dark:border-zinc-900">
                                          {vifVal === undefined ? (
                                            <span className="px-2 py-0.5 bg-zinc-50 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 rounded text-[10px] font-bold uppercase">N/A</span>
                                          ) : vifVal > 10 ? (
                                            <span className="px-2 py-0.5 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded text-[10px] font-bold uppercase">Colinealidad Alta</span>
                                          ) : vifVal > 5 ? (
                                            <span className="px-2 py-0.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded text-[10px] font-bold uppercase">Moderada</span>
                                          ) : (
                                            <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded text-[10px] font-bold uppercase">Segura</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="h-64 flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-600 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl transition-colors">
                      <BarChart3 size={48} className="mb-4 opacity-20" />
                      <p className="text-sm">Ejecute el análisis para generar los gráficos de diagnóstico.</p>
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === 'predict' && (
                <motion.div 
                  key="predict"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="max-w-2xl mx-auto space-y-8"
                >
                  {modelResults ? (
                    <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-8 transition-colors">
                      <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">Predecir Resultados</h2>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8">Ingrese valores para las variables independientes para estimar <strong>{modelResults.y_name}</strong>.</p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        {modelResults.x_names.map(x => (
                          <div key={x}>
                            <label className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-2 block">{x}</label>
                            <input 
                              type="number"
                              value={predictionInputs[x] || ''}
                              onChange={(e) => setPredictionInputs({ ...predictionInputs, [x]: e.target.value })}
                              className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-zinc-100/10 focus:outline-none transition-all dark:text-zinc-200"
                            />
                          </div>
                        ))}
                      </div>

                      <button 
                        onClick={predict}
                        className="w-full py-4 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-2xl font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 mb-8"
                      >
                        <Zap size={18} />
                        Calcular Predicción
                      </button>

                      {predictionOutput && (
                        <div className="pt-8 border-t border-zinc-100 dark:border-zinc-800 transition-colors" dangerouslySetInnerHTML={{ __html: predictionOutput }} />
                      )}
                    </div>
                  ) : (
                    <div className="h-64 flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-600 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl transition-colors">
                      <FileText size={48} className="mb-4 opacity-20" />
                      <p className="text-sm">Ejecute el análisis para habilitar las herramientas de predicción.</p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}

from flask import Flask, request, jsonify, send_from_directory
import pandas as pd
from datetime import datetime
import os
from threading import Lock

app = Flask(__name__, static_folder='', template_folder='')

# Ruta del archivo Excel
EXCEL_PATH = r"C:\Users\Administrador\Downloads\Descargas\Base personal I&M nuevo.xlsx"
HOJA_PERSONAL = "BASE"
HOJA_ASISTENCIA = "ASISTENCIA"

file_lock = Lock()

def inicializar_hoja_asistencia():
    """Verifica y prepara la hoja ASISTENCIA"""
    with file_lock:
        try:
            df_asistencia = pd.read_excel(EXCEL_PATH, sheet_name=HOJA_ASISTENCIA)
            
            if df_asistencia.empty or len(df_asistencia.columns) == 0:
                print("Inicializando estructura de ASISTENCIA...")
                df_asistencia = pd.DataFrame(columns=[
                    'CEDULA', 'NOMBRE_TECNICO', 'SUPERVISOR', 
                    'FECHA', 'HORA_ENTRADA', 'HORA_SALIDA', 'OBSERVACION'
                ])
                
                with pd.ExcelWriter(EXCEL_PATH, engine='openpyxl', mode='a', if_sheet_exists='replace') as writer:
                    df_asistencia.to_excel(writer, sheet_name=HOJA_ASISTENCIA, index=False)
                print("✓ Hoja ASISTENCIA inicializada")
            else:
                print("✓ Hoja ASISTENCIA ya existe")
            
        except Exception as e:
            print(f"Error inicializando hoja: {e}")

def obtener_tecnicos():
    """Lee la lista de técnicos desde el Excel"""
    try:
        df = pd.read_excel(EXCEL_PATH, sheet_name=HOJA_PERSONAL)
        df.columns = df.columns.str.strip()
        
        print(f"✓ Columnas detectadas: {list(df.columns)}")
        
        tecnicos = []
        for _, row in df.iterrows():
            tecnico = {
                'CEDULA': str(row['CEDULA']).strip(),
                'NOMBRE_TECNICO': str(row['NOMBRE TECNICO']).strip(),
                'SUPERVISOR': str(row['SUPERVISOR']).strip() if pd.notna(row['SUPERVISOR']) else 'Sin asignar',
                'CARGO': str(row['CARGO']).strip() if pd.notna(row['CARGO']) else '',
                'CIUDAD': str(row['CIUDAD']).strip() if pd.notna(row['CIUDAD']) else 'Sin asignar'
            }
            tecnicos.append(tecnico)
        
        print(f"✓ Técnicos cargados: {len(tecnicos)}")
        return tecnicos
        
    except Exception as e:
        print(f"❌ Error leyendo técnicos: {e}")
        import traceback
        traceback.print_exc()
        return []

def obtener_asistencia_hoy():
    """Obtiene registros de asistencia del día actual"""
    try:
        df = pd.read_excel(EXCEL_PATH, sheet_name=HOJA_ASISTENCIA)
        
        if df.empty:
            return []
        
        df.columns = df.columns.str.strip()
        hoy = datetime.now().strftime('%Y-%m-%d')
        
        if 'FECHA' in df.columns:
            df['FECHA'] = pd.to_datetime(df['FECHA'], errors='coerce').dt.strftime('%Y-%m-%d')
            df_hoy = df[df['FECHA'] == hoy]
            return df_hoy.to_dict('records')
        
        return []
        
    except Exception as e:
        print(f"Error leyendo asistencia: {e}")
        return []

def obtener_estado_tecnico(cedula, registros_hoy):
    """Determina el estado actual del técnico"""
    registro = next((r for r in registros_hoy if str(r.get('CEDULA', '')).strip() == str(cedula).strip()), None)
    
    if not registro:
        return 'PENDIENTE', None, None
    
    entrada = registro.get('HORA_ENTRADA')
    salida = registro.get('HORA_SALIDA')
    
    if pd.notna(entrada) and pd.notna(salida):
        return 'COMPLETADO', entrada, salida
    elif pd.notna(entrada):
        return 'EN PROCESO', entrada, None
    else:
        return 'PENDIENTE', None, None

@app.route('/')
def index():
    return send_from_directory('', 'index.html')

@app.route('/datos')
def datos():
    inicializar_hoja_asistencia()
    tecnicos = obtener_tecnicos()
    
    if not tecnicos:
        return jsonify({'error': 'No se pudieron cargar los técnicos'}), 500
    
    registros_hoy = obtener_asistencia_hoy()
    
    for tecnico in tecnicos:
        estado, entrada, salida = obtener_estado_tecnico(tecnico['CEDULA'], registros_hoy)
        tecnico['ESTADO'] = estado
        tecnico['HORA_ENTRADA'] = entrada if entrada else ''
        tecnico['HORA_SALIDA'] = salida if salida else ''
    
    total = len(tecnicos)
    presentes = sum(1 for t in tecnicos if t['ESTADO'] in ['EN PROCESO', 'COMPLETADO'])
    pendientes = sum(1 for t in tecnicos if t['ESTADO'] == 'PENDIENTE')
    en_proceso = sum(1 for t in tecnicos if t['ESTADO'] == 'EN PROCESO')
    completados = sum(1 for t in tecnicos if t['ESTADO'] == 'COMPLETADO')
    porcentaje_asistencia = round((presentes / total * 100), 1) if total > 0 else 0
    
    supervisores = sorted(list(set(t.get('SUPERVISOR', 'Sin asignar') for t in tecnicos)))
    ciudades = sorted(list(set(t.get('CIUDAD', 'Sin asignar') for t in tecnicos)))
    
    return jsonify({
        'tecnicos': tecnicos,
        'total': total,
        'presentes': presentes,
        'pendientes': pendientes,
        'en_proceso': en_proceso,
        'completados': completados,
        'porcentaje_asistencia': porcentaje_asistencia,
        'supervisores': supervisores,
        'ciudades': ciudades
    })

@app.route('/entrada', methods=['POST'])
def marcar_entrada():
    cedula = str(request.json.get('cedula')).strip()
    
    with file_lock:
        try:
            df_personal = pd.read_excel(EXCEL_PATH, sheet_name=HOJA_PERSONAL)
            df_personal.columns = df_personal.columns.str.strip()
            
            df_asistencia = pd.read_excel(EXCEL_PATH, sheet_name=HOJA_ASISTENCIA)
            
            if df_asistencia.empty or len(df_asistencia.columns) == 0:
                df_asistencia = pd.DataFrame(columns=[
                    'CEDULA', 'NOMBRE_TECNICO', 'SUPERVISOR', 
                    'FECHA', 'HORA_ENTRADA', 'HORA_SALIDA', 'OBSERVACION'
                ])
            else:
                df_asistencia.columns = df_asistencia.columns.str.strip()
            
            df_personal['CEDULA'] = df_personal['CEDULA'].astype(str).str.strip()
            tecnico = df_personal[df_personal['CEDULA'] == cedula]
            
            if tecnico.empty:
                return jsonify({'success': False, 'message': 'Técnico no encontrado'})
            
            tecnico = tecnico.iloc[0]
            hoy = datetime.now().strftime('%Y-%m-%d')
            
            if not df_asistencia.empty and 'FECHA' in df_asistencia.columns:
                df_asistencia['CEDULA'] = df_asistencia['CEDULA'].astype(str).str.strip()
                df_asistencia['FECHA'] = pd.to_datetime(df_asistencia['FECHA'], errors='coerce').dt.strftime('%Y-%m-%d')
                
                registro_hoy = df_asistencia[
                    (df_asistencia['CEDULA'] == cedula) & 
                    (df_asistencia['FECHA'] == hoy)
                ]
                
                if not registro_hoy.empty:
                    entrada = registro_hoy.iloc[0]['HORA_ENTRADA']
                    salida = registro_hoy.iloc[0]['HORA_SALIDA']
                    
                    if pd.notna(entrada) and pd.isna(salida):
                        return jsonify({'success': False, 'message': 'Ya tiene entrada registrada sin salida'})
                    elif pd.notna(entrada) and pd.notna(salida):
                        return jsonify({'success': False, 'message': 'Ya completó su asistencia hoy'})
            
            hora_actual = datetime.now().strftime('%H:%M:%S')
            nuevo_registro = pd.DataFrame([{
                'CEDULA': cedula,
                'NOMBRE_TECNICO': str(tecnico['NOMBRE TECNICO']).strip(),
                'SUPERVISOR': str(tecnico['SUPERVISOR']).strip() if pd.notna(tecnico['SUPERVISOR']) else 'Sin asignar',
                'FECHA': hoy,
                'HORA_ENTRADA': hora_actual,
                'HORA_SALIDA': None,
                'OBSERVACION': ''
            }])
            
            df_asistencia = pd.concat([df_asistencia, nuevo_registro], ignore_index=True)
            
            with pd.ExcelWriter(EXCEL_PATH, engine='openpyxl', mode='a', if_sheet_exists='replace') as writer:
                df_asistencia.to_excel(writer, sheet_name=HOJA_ASISTENCIA, index=False)
            
            return jsonify({'success': True, 'message': f'Entrada registrada: {hora_actual}'})
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            return jsonify({'success': False, 'message': f'Error: {str(e)}'})

@app.route('/salida', methods=['POST'])
def marcar_salida():
    cedula = str(request.json.get('cedula')).strip()
    
    with file_lock:
        try:
            df_asistencia = pd.read_excel(EXCEL_PATH, sheet_name=HOJA_ASISTENCIA)
            
            if df_asistencia.empty:
                return jsonify({'success': False, 'message': 'No hay entrada registrada hoy'})
            
            df_asistencia.columns = df_asistencia.columns.str.strip()
            hoy = datetime.now().strftime('%Y-%m-%d')
            
            df_asistencia['CEDULA'] = df_asistencia['CEDULA'].astype(str).str.strip()
            df_asistencia['FECHA'] = pd.to_datetime(df_asistencia['FECHA'], errors='coerce').dt.strftime('%Y-%m-%d')
            
            mask = (df_asistencia['CEDULA'] == cedula) & (df_asistencia['FECHA'] == hoy)
            registro_hoy = df_asistencia[mask]
            
            if registro_hoy.empty:
                return jsonify({'success': False, 'message': 'No hay entrada registrada hoy'})
            
            entrada = registro_hoy.iloc[0]['HORA_ENTRADA']
            salida = registro_hoy.iloc[0]['HORA_SALIDA']
            
            if pd.isna(entrada):
                return jsonify({'success': False, 'message': 'Debe marcar entrada primero'})
            
            if pd.notna(salida):
                return jsonify({'success': False, 'message': 'Ya tiene salida registrada'})
            
            hora_actual = datetime.now().strftime('%H:%M:%S')
            df_asistencia.loc[mask, 'HORA_SALIDA'] = hora_actual
            
            with pd.ExcelWriter(EXCEL_PATH, engine='openpyxl', mode='a', if_sheet_exists='replace') as writer:
                df_asistencia.to_excel(writer, sheet_name=HOJA_ASISTENCIA, index=False)
            
            return jsonify({'success': True, 'message': f'Salida registrada: {hora_actual}'})
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            return jsonify({'success': False, 'message': f'Error: {str(e)}'})

@app.route('/editar', methods=['POST'])
def editar_registro():
    cedula = str(request.json.get('cedula')).strip()
    tipo = request.json.get('tipo')
    nueva_hora = request.json.get('hora')
    
    with file_lock:
        try:
            df_asistencia = pd.read_excel(EXCEL_PATH, sheet_name=HOJA_ASISTENCIA)
            
            if df_asistencia.empty:
                return jsonify({'success': False, 'message': 'No hay registros de asistencia'})
            
            df_asistencia.columns = df_asistencia.columns.str.strip()
            hoy = datetime.now().strftime('%Y-%m-%d')
            
            df_asistencia['CEDULA'] = df_asistencia['CEDULA'].astype(str).str.strip()
            df_asistencia['FECHA'] = pd.to_datetime(df_asistencia['FECHA'], errors='coerce').dt.strftime('%Y-%m-%d')
            
            mask = (df_asistencia['CEDULA'] == cedula) & (df_asistencia['FECHA'] == hoy)
            registro_hoy = df_asistencia[mask]
            
            if registro_hoy.empty:
                return jsonify({'success': False, 'message': 'No hay registro para editar hoy'})
            
            try:
                datetime.strptime(nueva_hora, '%H:%M:%S')
            except:
                return jsonify({'success': False, 'message': 'Formato de hora inválido (debe ser HH:MM:SS)'})
            
            if tipo == 'entrada':
                df_asistencia.loc[mask, 'HORA_ENTRADA'] = nueva_hora
                mensaje = f'Entrada actualizada a: {nueva_hora}'
            elif tipo == 'salida':
                df_asistencia.loc[mask, 'HORA_SALIDA'] = nueva_hora
                mensaje = f'Salida actualizada a: {nueva_hora}'
            else:
                return jsonify({'success': False, 'message': 'Tipo de edición inválido'})
            
            with pd.ExcelWriter(EXCEL_PATH, engine='openpyxl', mode='a', if_sheet_exists='replace') as writer:
                df_asistencia.to_excel(writer, sheet_name=HOJA_ASISTENCIA, index=False)
            
            return jsonify({'success': True, 'message': mensaje})
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            return jsonify({'success': False, 'message': f'Error: {str(e)}'})

@app.route('/eliminar', methods=['POST'])
def eliminar_registro():
    cedula = str(request.json.get('cedula')).strip()
    
    with file_lock:
        try:
            df_asistencia = pd.read_excel(EXCEL_PATH, sheet_name=HOJA_ASISTENCIA)
            
            if df_asistencia.empty:
                return jsonify({'success': False, 'message': 'No hay registros de asistencia'})
            
            df_asistencia.columns = df_asistencia.columns.str.strip()
            hoy = datetime.now().strftime('%Y-%m-%d')
            
            df_asistencia['CEDULA'] = df_asistencia['CEDULA'].astype(str).str.strip()
            df_asistencia['FECHA'] = pd.to_datetime(df_asistencia['FECHA'], errors='coerce').dt.strftime('%Y-%m-%d')
            
            df_asistencia = df_asistencia[~((df_asistencia['CEDULA'] == cedula) & (df_asistencia['FECHA'] == hoy))]
            
            with pd.ExcelWriter(EXCEL_PATH, engine='openpyxl', mode='a', if_sheet_exists='replace') as writer:
                df_asistencia.to_excel(writer, sheet_name=HOJA_ASISTENCIA, index=False)
            
            return jsonify({'success': True, 'message': 'Registro eliminado correctamente'})
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            return jsonify({'success': False, 'message': f'Error: {str(e)}'})

if __name__ == '__main__':
    if not os.path.exists(EXCEL_PATH):
        print(f"❌ ERROR: No se encuentra el archivo {EXCEL_PATH}")
    else:
        print("=" * 60)
        print("🚀 SERVIDOR DE ASISTENCIA - CONECTAR TV")
        print("=" * 60)
        print(f"📂 Archivo: {EXCEL_PATH}")
        print(f"🌐 URL Local: http://localhost:5000")
        print(f"🌐 URL Red: http://0.0.0.0:5000")
        print("=" * 60)
        app.run(host='0.0.0.0', port=5000, debug=True)
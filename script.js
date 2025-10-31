// script.js - Versión Google Sheets API

let gapiInited = false;
let gisInited = false;
let tokenClient;
let datosGlobales = null;
let cedulaEditar = null;
let tipoEditar = null;

const modalEditarHora = new bootstrap.Modal(document.getElementById('modalEditarHora'));

// Mostrar fecha actual
const hoy = new Date();
const opciones = { year: 'numeric', month: '2-digit', day: '2-digit' };
document.getElementById('fecha-actual').textContent = hoy.toLocaleDateString('es-CO', opciones);

// Inicializar Google API
function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
    await gapi.client.init({
        apiKey: CONFIG.API_KEY,
        discoveryDocs: CONFIG.DISCOVERY_DOCS,
    });
    gapiInited = true;
    maybeEnableButtons();
}

function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.CLIENT_ID,
        scope: CONFIG.SCOPES,
        callback: '', // Se define después
    });
    gisInited = true;
    maybeEnableButtons();
}

function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        document.getElementById('btnAutorizar').style.display = 'inline-block';
    }
}

// Autorización
document.getElementById('btnAutorizar').addEventListener('click', handleAuthClick);
document.getElementById('btnCerrarSesion').addEventListener('click', handleSignoutClick);

function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            throw (resp);
        }
        document.getElementById('btnAutorizar').style.display = 'none';
        document.getElementById('btnCerrarSesion').style.display = 'inline-block';
        await cargarDatos();
    };

    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        tokenClient.requestAccessToken({prompt: ''});
    }
}

function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        document.getElementById('btnAutorizar').style.display = 'inline-block';
        document.getElementById('btnCerrarSesion').style.display = 'none';
        document.getElementById('tbody-tecnicos').innerHTML = '';
    }
}

// Cargar datos desde Google Sheets
async function cargarDatos() {
    try {
        // Leer hoja BASE
        const responseBase = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: `${CONFIG.HOJA_BASE}!A:F`,
        });

        const rowsBase = responseBase.result.values;
        if (!rowsBase || rowsBase.length === 0) {
            alert('No se encontraron datos en la hoja BASE');
            return;
        }

        // Leer hoja ASISTENCIA
        const responseAsistencia = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: `${CONFIG.HOJA_ASISTENCIA}!A:G`,
        });

        const rowsAsistencia = responseAsistencia.result.values || [];

        // Procesar datos
        const tecnicos = procesarTecnicos(rowsBase, rowsAsistencia);
        const datos = calcularEstadisticas(tecnicos);

        datosGlobales = datos;
        actualizarEstadisticas(datos);
        cargarFiltros(datos);
        renderizarTabla(datos.tecnicos);

    } catch (error) {
        console.error('Error cargando datos:', error);
        alert('Error al cargar datos de Google Sheets: ' + error.message);
    }
}

function procesarTecnicos(rowsBase, rowsAsistencia) {
    const headers = rowsBase[0];
    const tecnicos = [];
    const hoyStr = new Date().toISOString().split('T')[0];

    // Crear mapa de asistencia de hoy
    const asistenciaHoy = {};
    if (rowsAsistencia.length > 1) {
        const headersAsistencia = rowsAsistencia[0];
        const idxCedula = headersAsistencia.indexOf('CEDULA');
        const idxFecha = headersAsistencia.indexOf('FECHA');
        const idxEntrada = headersAsistencia.indexOf('HORA_ENTRADA');
        const idxSalida = headersAsistencia.indexOf('HORA_SALIDA');

        for (let i = 1; i < rowsAsistencia.length; i++) {
            const row = rowsAsistencia[i];
            const cedula = row[idxCedula]?.toString().trim();
            const fecha = row[idxFecha];
            
            // Convertir fecha a formato YYYY-MM-DD
            let fechaFormateada = '';
            if (fecha) {
                const d = new Date(fecha);
                if (!isNaN(d.getTime())) {
                    fechaFormateada = d.toISOString().split('T')[0];
                }
            }

            if (cedula && fechaFormateada === hoyStr) {
                asistenciaHoy[cedula] = {
                    entrada: row[idxEntrada] || '',
                    salida: row[idxSalida] || ''
                };
            }
        }
    }

    // Procesar técnicos
    const idxCedula = headers.indexOf('CEDULA');
    const idxNombre = headers.indexOf('NOMBRE TECNICO');
    const idxSupervisor = headers.indexOf('SUPERVISOR');
    const idxCiudad = headers.indexOf('CIUDAD');

    for (let i = 1; i < rowsBase.length; i++) {
        const row = rowsBase[i];
        const cedula = row[idxCedula]?.toString().trim();
        
        if (!cedula) continue;

        const asistencia = asistenciaHoy[cedula] || { entrada: '', salida: '' };
        let estado = 'PENDIENTE';
        
        if (asistencia.entrada && asistencia.salida) {
            estado = 'COMPLETADO';
        } else if (asistencia.entrada) {
            estado = 'EN PROCESO';
        }

        tecnicos.push({
            CEDULA: cedula,
            NOMBRE_TECNICO: row[idxNombre] || '',
            SUPERVISOR: row[idxSupervisor] || 'Sin asignar',
            CIUDAD: row[idxCiudad] || 'Sin asignar',
            ESTADO: estado,
            HORA_ENTRADA: asistencia.entrada,
            HORA_SALIDA: asistencia.salida
        });
    }

    return tecnicos;
}

function calcularEstadisticas(tecnicos) {
    const total = tecnicos.length;
    const completados = tecnicos.filter(t => t.ESTADO === 'COMPLETADO').length;
    const en_proceso = tecnicos.filter(t => t.ESTADO === 'EN PROCESO').length;
    const pendientes = tecnicos.filter(t => t.ESTADO === 'PENDIENTE').length;
    const presentes = completados + en_proceso;
    const porcentaje_asistencia = total > 0 ? Math.round((presentes / total) * 100) : 0;

    const supervisores = [...new Set(tecnicos.map(t => t.SUPERVISOR))].sort();
    const ciudades = [...new Set(tecnicos.map(t => t.CIUDAD))].sort();

    return {
        tecnicos,
        total,
        completados,
        en_proceso,
        pendientes,
        presentes,
        porcentaje_asistencia,
        supervisores,
        ciudades
    };
}

function actualizarEstadisticas(datos) {
    document.getElementById('stat-total').textContent = datos.total;
    document.getElementById('stat-completados').textContent = datos.completados;
    document.getElementById('stat-proceso').textContent = datos.en_proceso;
    document.getElementById('stat-pendientes').textContent = datos.pendientes;
    document.getElementById('stat-presentes').textContent = datos.presentes;
    document.getElementById('stat-total-barra').textContent = datos.total;
    document.getElementById('porcentaje-badge').textContent = datos.porcentaje_asistencia + '%';
    document.getElementById('barra-progreso').style.width = datos.porcentaje_asistencia + '%';
    document.getElementById('barra-progreso').setAttribute('aria-valuenow', datos.porcentaje_asistencia);
}

function cargarFiltros(datos) {
    const selectSupervisor = document.getElementById('filtroSupervisor');
    const selectCiudad = document.getElementById('filtroCiudad');
    
    selectSupervisor.innerHTML = '<option value="">📊 Todos los supervisores</option>';
    datos.supervisores.forEach(sup => {
        selectSupervisor.innerHTML += `<option value="${sup}">${sup}</option>`;
    });
    
    selectCiudad.innerHTML = '<option value="">🏙️ Todas las ciudades</option>';
    datos.ciudades.forEach(ciudad => {
        selectCiudad.innerHTML += `<option value="${ciudad}">${ciudad}</option>`;
    });
}

function renderizarTabla(tecnicos) {
    const tbody = document.getElementById('tbody-tecnicos');
    tbody.innerHTML = '';
    
    tecnicos.forEach(tecnico => {
        const tr = document.createElement('tr');
        tr.className = 'tecnico-row';
        tr.dataset.cedula = tecnico.CEDULA;
        tr.dataset.nombre = tecnico.NOMBRE_TECNICO;
        tr.dataset.supervisor = tecnico.SUPERVISOR;
        tr.dataset.ciudad = tecnico.CIUDAD;
        tr.dataset.estado = tecnico.ESTADO;
        
        const btnEntradaDisabled = ['EN PROCESO', 'COMPLETADO'].includes(tecnico.ESTADO) ? 'disabled' : '';
        const btnSalidaDisabled = tecnico.ESTADO !== 'EN PROCESO' ? 'disabled' : '';
        const btnEliminar = tecnico.ESTADO !== 'PENDIENTE' ? 
            `<button class="btn btn-warning btn-eliminar" data-cedula="${tecnico.CEDULA}" title="Eliminar registro">🗑️ Eliminar</button>` : '';
        
        const btnEditarEntrada = tecnico.HORA_ENTRADA ? 
            `<button class="btn btn-sm btn-link btn-editar-hora" data-cedula="${tecnico.CEDULA}" data-tipo="entrada" data-hora="${tecnico.HORA_ENTRADA}" title="Editar entrada">✏️</button>` : '';
        
        const btnEditarSalida = tecnico.HORA_SALIDA ? 
            `<button class="btn btn-sm btn-link btn-editar-hora" data-cedula="${tecnico.CEDULA}" data-tipo="salida" data-hora="${tecnico.HORA_SALIDA}" title="Editar salida">✏️</button>` : '';
        
        tr.innerHTML = `
            <td>${tecnico.CEDULA}</td>
            <td>${tecnico.NOMBRE_TECNICO}</td>
            <td>${tecnico.CIUDAD}</td>
            <td>${tecnico.SUPERVISOR}</td>
            <td><span class="badge estado-${tecnico.ESTADO.replace(' ', '\\ ')}">${tecnico.ESTADO}</span></td>
            <td class="hora-entrada">
                <span class="hora-display">${tecnico.HORA_ENTRADA}</span>
                ${btnEditarEntrada}
            </td>
            <td class="hora-salida">
                <span class="hora-display">${tecnico.HORA_SALIDA}</span>
                ${btnEditarSalida}
            </td>
            <td>
                <div class="btn-group-vertical btn-group-sm" role="group">
                    <button class="btn btn-success btn-entrada" data-cedula="${tecnico.CEDULA}" ${btnEntradaDisabled}>✓ Entrada</button>
                    <button class="btn btn-danger btn-salida" data-cedula="${tecnico.CEDULA}" ${btnSalidaDisabled}>✗ Salida</button>
                    ${btnEliminar}
                </div>
            </td>
        `;
        
        tbody.appendChild(tr);
    });
    
    agregarEventListeners();
}

function agregarEventListeners() {
    document.querySelectorAll('.btn-entrada').forEach(btn => {
        btn.addEventListener('click', marcarEntrada);
    });
    
    document.querySelectorAll('.btn-salida').forEach(btn => {
        btn.addEventListener('click', marcarSalida);
    });
    
    document.querySelectorAll('.btn-editar-hora').forEach(btn => {
        btn.addEventListener('click', abrirModalEditar);
    });
    
    document.querySelectorAll('.btn-eliminar').forEach(btn => {
        btn.addEventListener('click', eliminarRegistro);
    });
}

// Filtrado
document.getElementById('busqueda').addEventListener('input', filtrarTabla);
document.getElementById('filtroSupervisor').addEventListener('change', filtrarTabla);
document.getElementById('filtroCiudad').addEventListener('change', filtrarTabla);
document.getElementById('filtroEstado').addEventListener('change', filtrarTabla);

function filtrarTabla() {
    const busqueda = document.getElementById('busqueda').value.toLowerCase();
    const supervisor = document.getElementById('filtroSupervisor').value.toLowerCase();
    const ciudad = document.getElementById('filtroCiudad').value.toLowerCase();
    const estadoFiltro = document.getElementById('filtroEstado').value;
    const filas = document.querySelectorAll('.tecnico-row');

    let totalFiltrado = 0;
    let completadosFiltrado = 0;
    let procesoFiltrado = 0;
    let pendientesFiltrado = 0;

    filas.forEach(fila => {
        const nombre = fila.dataset.nombre.toLowerCase();
        const cedula = fila.dataset.cedula.toLowerCase();
        const sup = fila.dataset.supervisor.toLowerCase();
        const ciu = fila.dataset.ciudad.toLowerCase();
        const estado = fila.dataset.estado;

        const coincideBusqueda = nombre.includes(busqueda) || cedula.includes(busqueda);
        const coincideSupervisor = !supervisor || sup.includes(supervisor);
        const coincideCiudad = !ciudad || ciu.includes(ciudad);
        const coincideEstado = !estadoFiltro || estado === estadoFiltro;

        const visible = coincideBusqueda && coincideSupervisor && coincideCiudad && coincideEstado;
        fila.style.display = visible ? '' : 'none';

        if (visible) {
            totalFiltrado++;
            if (estado === 'COMPLETADO') completadosFiltrado++;
            else if (estado === 'EN PROCESO') procesoFiltrado++;
            else if (estado === 'PENDIENTE') pendientesFiltrado++;
        }
    });

    document.getElementById('stat-total').textContent = totalFiltrado;
    document.getElementById('stat-completados').textContent = completadosFiltrado;
    document.getElementById('stat-proceso').textContent = procesoFiltrado;
    document.getElementById('stat-pendientes').textContent = pendientesFiltrado;
    
    const presentesFiltrado = completadosFiltrado + procesoFiltrado;
    document.getElementById('stat-presentes').textContent = presentesFiltrado;
    document.getElementById('stat-total-barra').textContent = totalFiltrado;
    
    const porcentaje = totalFiltrado > 0 ? Math.round((presentesFiltrado / totalFiltrado) * 100) : 0;
    document.getElementById('porcentaje-badge').textContent = porcentaje + '%';
    document.getElementById('barra-progreso').style.width = porcentaje + '%';
    document.getElementById('barra-progreso').setAttribute('aria-valuenow', porcentaje);
}

// Marcar entrada
async function marcarEntrada() {
    const cedula = this.dataset.cedula;
    
    if (!confirm('¿Confirmar entrada?')) return;

    try {
        const tecnico = datosGlobales.tecnicos.find(t => t.CEDULA === cedula);
        if (!tecnico) {
            alert('Técnico no encontrado');
            return;
        }

        const hoy = new Date().toISOString().split('T')[0];
        const horaActual = new Date().toTimeString().split(' ')[0];

        const values = [[
            cedula,
            tecnico.NOMBRE_TECNICO,
            tecnico.SUPERVISOR,
            hoy,
            horaActual,
            '',
            ''
        ]];

        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: `${CONFIG.HOJA_ASISTENCIA}!A:G`,
            valueInputOption: 'USER_ENTERED',
            resource: { values }
        });

        alert(`✓ Entrada registrada: ${horaActual}`);
        await cargarDatos();

    } catch (error) {
        console.error('Error:', error);
        alert('Error al registrar entrada: ' + error.message);
    }
}

// Marcar salida
async function marcarSalida() {
    const cedula = this.dataset.cedula;
    
    if (!confirm('¿Confirmar salida?')) return;

    try {
        const hoy = new Date().toISOString().split('T')[0];
        const horaActual = new Date().toTimeString().split(' ')[0];

        // Buscar fila en ASISTENCIA
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: `${CONFIG.HOJA_ASISTENCIA}!A:G`,
        });

        const rows = response.result.values;
        if (!rows || rows.length === 0) {
            alert('No hay entrada registrada');
            return;
        }

        const headers = rows[0];
        const idxCedula = headers.indexOf('CEDULA');
        const idxFecha = headers.indexOf('FECHA');
        const idxSalida = headers.indexOf('HORA_SALIDA');

        let filaEncontrada = -1;
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const cedulaRow = row[idxCedula]?.toString().trim();
            const fechaRow = new Date(row[idxFecha]).toISOString().split('T')[0];

            if (cedulaRow === cedula && fechaRow === hoy) {
                filaEncontrada = i + 1; // +1 porque las filas empiezan en 1
                break;
            }
        }

        if (filaEncontrada === -1) {
            alert('No hay entrada registrada hoy');
            return;
        }

        // Actualizar salida
        const columnaLetra = String.fromCharCode(65 + idxSalida); // Convertir índice a letra (F)
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: `${CONFIG.HOJA_ASISTENCIA}!${columnaLetra}${filaEncontrada}`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [[horaActual]] }
        });

        alert(`✓ Salida registrada: ${horaActual}`);
        await cargarDatos();

    } catch (error) {
        console.error('Error:', error);
        alert('Error al registrar salida: ' + error.message);
    }
}

// Editar hora
function abrirModalEditar() {
    cedulaEditar = this.dataset.cedula;
    tipoEditar = this.dataset.tipo;
    const horaActual = this.dataset.hora;
    
    document.getElementById('inputNuevaHora').value = horaActual;
    modalEditarHora.show();
}

document.getElementById('btnGuardarHora').addEventListener('click', async function() {
    const nuevaHora = document.getElementById('inputNuevaHora').value + ':00';
    
    if (!nuevaHora) {
        alert('Debe ingresar una hora válida');
        return;
    }

    try {
        const hoy = new Date().toISOString().split('T')[0];

        // Buscar fila
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: `${CONFIG.HOJA_ASISTENCIA}!A:G`,
        });

        const rows = response.result.values;
        const headers = rows[0];
        const idxCedula = headers.indexOf('CEDULA');
        const idxFecha = headers.indexOf('FECHA');
        const idxEntrada = headers.indexOf('HORA_ENTRADA');
        const idxSalida = headers.indexOf('HORA_SALIDA');

        let filaEncontrada = -1;
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const cedulaRow = row[idxCedula]?.toString().trim();
            const fechaRow = new Date(row[idxFecha]).toISOString().split('T')[0];

            if (cedulaRow === cedulaEditar && fechaRow === hoy) {
                filaEncontrada = i + 1;
                break;
            }
        }

        if (filaEncontrada === -1) {
            alert('No se encontró el registro');
            return;
        }

        // Actualizar
        const columnaIdx = tipoEditar === 'entrada' ? idxEntrada : idxSalida;
        const columnaLetra = String.fromCharCode(65 + columnaIdx);
        
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: `${CONFIG.HOJA_ASISTENCIA}!${columnaLetra}${filaEncontrada}`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [[nuevaHora]] }
        });

        alert(`✓ ${tipoEditar === 'entrada' ? 'Entrada' : 'Salida'} actualizada a: ${nuevaHora}`);
        modalEditarHora.hide();
        await cargarDatos();

    } catch (error) {
        console.error('Error:', error);
        alert('Error al editar hora: ' + error.message);
    }
});

// Eliminar registro
async function eliminarRegistro() {
    const cedula = this.dataset.cedula;
    
    if (!confirm('¿Está seguro de eliminar este registro? Esta acción no se puede deshacer.')) return;

    try {
        const hoy = new Date().toISOString().split('T')[0];

        // Obtener metadata del spreadsheet para conseguir el sheetId
        const metadataResponse = await gapi.client.sheets.spreadsheets.get({
            spreadsheetId: CONFIG.SPREADSHEET_ID
        });

        const sheets = metadataResponse.result.sheets;
        const asistenciaSheet = sheets.find(s => s.properties.title === CONFIG.HOJA_ASISTENCIA);
        
        if (!asistenciaSheet) {
            alert('No se encontró la hoja ASISTENCIA');
            return;
        }

        const sheetId = asistenciaSheet.properties.sheetId;

        // Buscar fila
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: `${CONFIG.HOJA_ASISTENCIA}!A:G`,
        });

        const rows = response.result.values;
        const headers = rows[0];
        const idxCedula = headers.indexOf('CEDULA');
        const idxFecha = headers.indexOf('FECHA');

        let filaEncontrada = -1;
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const cedulaRow = row[idxCedula]?.toString().trim();
            const fechaRow = new Date(row[idxFecha]).toISOString().split('T')[0];

            if (cedulaRow === cedula && fechaRow === hoy) {
                filaEncontrada = i;
                break;
            }
        }

        if (filaEncontrada === -1) {
            alert('No se encontró el registro');
            return;
        }

        // Eliminar fila
        await gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            resource: {
                requests: [{
                    deleteDimension: {
                        range: {
                            sheetId: sheetId,
                            dimension: 'ROWS',
                            startIndex: filaEncontrada,
                            endIndex: filaEncontrada + 1
                        }
                    }
                }]
            }
        });

        alert('✓ Registro eliminado correctamente');
        await cargarDatos();

    } catch (error) {
        console.error('Error completo:', error);
        alert('Error al eliminar registro: ' + (error.result?.error?.message || error.message));
    }
}
// script.js
const hoy = new Date();
const opciones = { year: 'numeric', month: '2-digit', day: '2-digit' };
document.getElementById('fecha-actual').textContent = hoy.toLocaleDateString('es-CO', opciones);

let cedulaEditar = null;
let tipoEditar = null;
let datosGlobales = null;
const modalEditarHora = new bootstrap.Modal(document.getElementById('modalEditarHora'));

// Cargar datos al iniciar
cargarDatos();

async function cargarDatos() {
    try {
        const response = await fetch('/datos');
        const datos = await response.json();
        
        if (datos.error) {
            alert('Error cargando datos: ' + datos.error);
            return;
        }
        
        datosGlobales = datos;
        actualizarEstadisticas(datos);
        cargarFiltros(datos);
        renderizarTabla(datos.tecnicos);
        
    } catch (error) {
        console.error('Error:', error);
        alert('Error de conexión con el servidor');
    }
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
            <td><span class="badge estado-${tecnico.ESTADO}">${tecnico.ESTADO}</span></td>
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
    
    // Agregar event listeners
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

    // Actualizar estadísticas
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

async function marcarEntrada() {
    const cedula = this.dataset.cedula;
    
    if (!confirm('¿Confirmar entrada?')) return;

    try {
        const response = await fetch('/entrada', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({cedula})
        });

        const data = await response.json();
        
        if (data.success) {
            alert('✓ ' + data.message);
            location.reload();
        } else {
            alert('✗ ' + data.message);
        }
    } catch (error) {
        alert('Error de conexión: ' + error);
    }
}

async function marcarSalida() {
    const cedula = this.dataset.cedula;
    
    if (!confirm('¿Confirmar salida?')) return;

    try {
        const response = await fetch('/salida', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({cedula})
        });

        const data = await response.json();
        
        if (data.success) {
            alert('✓ ' + data.message);
            location.reload();
        } else {
            alert('✗ ' + data.message);
        }
    } catch (error) {
        alert('Error de conexión: ' + error);
    }
}

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
        const response = await fetch('/editar', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                cedula: cedulaEditar,
                tipo: tipoEditar,
                hora: nuevaHora
            })
        });

        const data = await response.json();
        
        if (data.success) {
            alert('✓ ' + data.message);
            modalEditarHora.hide();
            location.reload();
        } else {
            alert('✗ ' + data.message);
        }
    } catch (error) {
        alert('Error de conexión: ' + error);
    }
});

async function eliminarRegistro() {
    const cedula = this.dataset.cedula;
    
    if (!confirm('¿Está seguro de eliminar este registro? Esta acción no se puede deshacer.')) return;

    try {
        const response = await fetch('/eliminar', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({cedula})
        });

        const data = await response.json();
        
        if (data.success) {
            alert('✓ ' + data.message);
            location.reload();
        } else {
            alert('✗ ' + data.message);
        }
    } catch (error) {
        alert('Error de conexión: ' + error);
    }
}
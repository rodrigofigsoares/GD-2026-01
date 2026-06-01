// main.js
const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);

let solarPanels = [];
let scene;

// Função para atualizar cores baseada nos dados recebidos
function updatePanelColors(efficiency) {
    // Calcula a cor baseada na eficiência (0-100%)
    let colorHex;
    
    if (efficiency >= 70) {
        // Verde para alta eficiência
        colorHex = "#00ff00";
    } else if (efficiency >= 30) {
        // Amarelo para eficiência média
        colorHex = "#ffff00";
    } else {
        // Vermelho para baixa eficiência
        colorHex = "#ff0000";
    }
    
    const colorBabylon = BABYLON.Color3.FromHexString(colorHex);
    
    // Aplica a cor a todos os painéis
    solarPanels.forEach(panel => {
        if (panel.material) {
            panel.material.diffuseColor = colorBabylon;
        }
    });
    
    // Atualiza o indicador visual
    const efficiencyColor = document.getElementById("efficiencyColor");
    if (efficiencyColor) {
        efficiencyColor.style.backgroundColor = colorHex;
    }
}

// Função para criar os painéis solares
function createSolarPanels(scene) {
    const panels = [];
    const rows = 3;
    const cols = 3;
    const spacing = 2.5;
    const startX = -(cols - 1) * spacing / 2;
    const startZ = -(rows - 1) * spacing / 2;
    
    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            // Criar o painel solar
            const panel = BABYLON.MeshBuilder.CreateBox("panel_" + i + "_" + j, {
                width: 1.8,
                height: 0.1,
                depth: 1.2
            }, scene);
            
            // Material do painel
            const panelMaterial = new BABYLON.StandardMaterial("panelMat_" + i + "_" + j, scene);
            panelMaterial.diffuseColor = new BABYLON.Color3(0, 0.5, 0);
            panel.material = panelMaterial;
            
            // Posicionar o painel no grid
            panel.position.x = startX + j * spacing;
            panel.position.z = startZ + i * spacing;
            panel.position.y = 0.5;
            
            // Inclinar o painel
            panel.rotation.x = Math.PI / 6;
            
            panels.push(panel);
        }
    }
    
    return panels;
}

// Função para criar a interface de controle
function createUIControls() {
    // Criar div de controles
    let controlsDiv = document.getElementById("controls");
    if (!controlsDiv) {
        controlsDiv = document.createElement("div");
        controlsDiv.id = "controls";
        controlsDiv.style.cssText = `
            position: absolute;
            top: 20px;
            left: 20px;
            background: rgba(0,0,0,0.7);
            color: white;
            padding: 15px;
            border-radius: 8px;
            z-index: 100;
            font-family: Arial, sans-serif;
        `;
        
        controlsDiv.innerHTML = `
            <h3>Controle dos Painéis Solares</h3>
            <button id="simulateBtn">Simular Dados</button>
            <button id="manualColorBtn">Cor Manual</button>
            <input type="color" id="colorPicker" value="#00ff00">
        `;
        
        document.body.appendChild(controlsDiv);
    }
    
    // Criar painel de dados
    let dataPanel = document.getElementById("data-panel");
    if (!dataPanel) {
        dataPanel = document.createElement("div");
        dataPanel.id = "data-panel";
        dataPanel.style.cssText = `
            position: absolute;
            top: 20px;
            right: 20px;
            background: rgba(0,0,0,0.7);
            color: white;
            padding: 15px;
            border-radius: 8px;
            z-index: 100;
            min-width: 200px;
            font-family: Arial, sans-serif;
        `;
        
        dataPanel.innerHTML = `
            <h3>Dados em Tempo Real</h3>
            <div>
                <strong>Eficiência:</strong> 
                <span id="efficiency">0%</span>
                <span id="efficiencyColor" style="display:inline-block; width:20px; height:20px; border-radius:50%; margin-left:10px;"></span>
            </div>
            <div style="margin-top:10px;">
                <strong>Status:</strong> 
                <span id="status">Normal</span>
            </div>
        `;
        
        document.body.appendChild(dataPanel);
    }
}

// Função para receber e processar dados
function receiveData(efficiency) {
    // Atualiza os valores na interface
    const efficiencyElem = document.getElementById("efficiency");
    const statusElem = document.getElementById("status");
    
    if (efficiencyElem) efficiencyElem.textContent = efficiency + "%";
    
    // Determina o status baseado nos dados
    let status = "Normal";
    if (efficiency < 30) status = "Baixa Eficiência";
    else if (efficiency > 85) status = "Excelente";
    
    if (statusElem) statusElem.textContent = status;
    
    // Atualiza as cores dos painéis
    updatePanelColors(efficiency);
}

// Função para simular dados aleatórios
function simulateDataUpdate() {
    const efficiency = Math.floor(Math.random() * 100);
    receiveData(efficiency);
}

// Função para definir cor manual
function setManualColor() {
    const colorPicker = document.getElementById("colorPicker");
    if (colorPicker) {
        const color = colorPicker.value;
        const colorBabylon = BABYLON.Color3.FromHexString(color);
        
        solarPanels.forEach(panel => {
            if (panel.material) {
                panel.material.diffuseColor = colorBabylon;
            }
        });
        
        const efficiencyColor = document.getElementById("efficiencyColor");
        if (efficiencyColor) {
            efficiencyColor.style.backgroundColor = color;
        }
    }
}

// Função principal para criar a cena
var createScene = function() {
    scene = new BABYLON.Scene(engine);
    
    // Configura o fundo
    scene.clearColor = new BABYLON.Color3(0.1, 0.2, 0.3);
    
    // Câmera
    var camera = new BABYLON.ArcRotateCamera(
        "camera", 
        -Math.PI / 4, 
        Math.PI / 3, 
        12, 
        new BABYLON.Vector3(0, 2, 0), 
        scene
    );
    camera.attachControl(canvas, true);
    
    // Luz hemisférica
    var light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.7;
    
    // Chão
    var ground = BABYLON.MeshBuilder.CreateGround("ground", {
        width: 15, 
        height: 15
    }, scene);
    
    // Criar os painéis solares
    solarPanels = createSolarPanels(scene);
    
    // Criar interface
    createUIControls();
    
    // Configurar botões
    setTimeout(() => {
        const simulateBtn = document.getElementById("simulateBtn");
        const manualColorBtn = document.getElementById("manualColorBtn");
        
        if (simulateBtn) simulateBtn.onclick = simulateDataUpdate;
        if (manualColorBtn) manualColorBtn.onclick = setManualColor;
    }, 100);
    
    return scene;
};

// Inicializar
try {
    const sceneInstance = createScene();
    
    engine.runRenderLoop(function() {
        if (sceneInstance) {
            sceneInstance.render();
        }
    });
    
    window.addEventListener("resize", function() {
        engine.resize();
    });
    
    // Simular primeiro dado
    setTimeout(() => {
        simulateDataUpdate();
        // Atualizar a cada 5 segundos
        setInterval(simulateDataUpdate, 5000);
    }, 1000);
    
    console.log("Aplicação iniciada com sucesso!");
} catch (error) {
    console.error("Erro ao iniciar:", error);
}
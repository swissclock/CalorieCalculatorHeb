let nutritionData = {};
let allProducts = {};
let nutrientDictionary = {};
let popularProducts = {};
let historyList = [];
let currentProduct = null;

// Load JSON data
async function loadJSONData() {
    nutritionData = await fetch("nutrition_data.json").then(response => response.json());
    allProducts = await fetch("all_alphabetical.json").then(response => response.json());
    nutrientDictionary = await fetch("dictionary.json").then(response => response.json());
    popularProducts = await fetch("popular.json").then(response => response.json());

    populatePopularProducts();
    setupAutocompleteSearch();
}

// Populate popular products as badges
function populatePopularProducts() {
    const popularContainer = document.getElementById("popular-products");

    popularProducts.forEach(item => {
        const badge = document.createElement("div");
        badge.className = "popular-badge";
        badge.textContent = item.name;
        badge.dataset.id = item.id;

        badge.addEventListener("click", () => {
            currentProduct = item;
            refreshValuesTable();
        });

        popularContainer.appendChild(badge);
    });
}

// Function to set up autocomplete search
function setupAutocompleteSearch() {
    const searchInput = document.getElementById("product-search");
    const autocompleteList = document.createElement("div");
    autocompleteList.id = "autocomplete-list";
    searchInput.parentNode.appendChild(autocompleteList);

    searchInput.addEventListener("input", () => {
        const query = searchInput.value.trim();
        autocompleteList.innerHTML = ""; // Clear previous results

        if (query.length >= 2) {
            const matches = Object.values(allProducts)
                .flat()
                .filter(product => product.name.includes(query));

            matches.forEach(product => {
                const item = document.createElement("div");
                item.className = "autocomplete-item";
                item.textContent = product.name;
                item.dataset.id = product.id;

                item.addEventListener("click", () => {
                    currentProduct = product;
                    searchInput.value = product.name;
                    autocompleteList.innerHTML = "";
                    refreshValuesTable();
                });

                autocompleteList.appendChild(item);
            });
        }
    });

}

// Function to refresh the values table
function refreshValuesTable() {
    const resultContainer = document.getElementById("results-list");
    resultContainer.innerHTML = ""; // Clear previous results

    if (currentProduct && nutritionData[currentProduct.id]) {
        nutritionData[currentProduct.id].forEach(nutrient => {
            const nutrientName = nutrientDictionary.find(dict => dict.id === nutrient.id)?.value;
            const nutrientValue = nutrient.value;

            if (nutrientName) {
                const listItem = document.createElement("li");
                listItem.textContent = `${nutrientName}: ${nutrientValue}`;
                resultContainer.appendChild(listItem);
            }
        });
    }
}

// Add selected product and weight to the cumulative list and update totals
function addToList() {
    const weight = parseFloat(document.getElementById("weight").value);

    if (currentProduct && weight > 0) {
        const productNutrition = nutritionData[currentProduct.id];
        let totalCalories = 0, totalCarbs = 0, totalFat = 0;

        productNutrition.forEach(nutrient => {
            const nutrientName = nutrientDictionary.find(dict => dict.id === nutrient.id)?.value;
            const nutrientValue = parseFloat(nutrient.value) * weight / 100;

            if (nutrientName === "קלוריות") totalCalories += nutrientValue;
            if (nutrientName === "פחמימות") totalCarbs += nutrientValue;
            if (nutrientName === "שומן") totalFat += nutrientValue;
        });

        historyList.push({
            product: currentProduct.name,
            weight,
            calories: totalCalories.toFixed(2),
            carbs: totalCarbs.toFixed(2),
            fat: totalFat.toFixed(2)
        });

        displayHistory();
        updateTotals();
    }
}

// Update displayed totals
function updateTotals() {
    let totalCalories = 0;
    let totalCarbs = 0;
    let totalFats = 0;    
    historyList.forEach(entry => {
        totalCalories += parseFloat(entry.calories);
        totalCarbs += parseFloat(entry.carbs);
        totalFats += parseFloat(entry.fat);

    });
    document.getElementById("total-calories").textContent = `סה״כ קלוריות: ${totalCalories.toFixed(2)}`;
    document.getElementById("total-carbs").textContent = `סה״כ פחמימות: ${totalCarbs.toFixed(2)}`;
    document.getElementById("total-fat").textContent = `סה״כ שומן: ${totalFats.toFixed(2)}`;
}

// Display history list
function displayHistory() {
    const historyListContainer = document.getElementById("history-list");
    historyListContainer.innerHTML = "";

    historyList.forEach(entry => {
        const listItem = document.createElement("li");
        listItem.textContent = `${entry.product} - ${entry.weight} גרם - קלוריות: ${entry.calories}`;
        historyListContainer.appendChild(listItem);
    });
}

// Calculate grams based on carb input
function calculateGramsForCarbs() {
    const targetCarbs = parseFloat(document.getElementById("target-carbs").value);
    if (currentProduct && targetCarbs && nutritionData[currentProduct.id]) {
        const carbsPer100g = nutritionData[currentProduct.id].find(nutrient => nutrient.id === "8").value;
        const carbsPerGram = carbsPer100g / 100;
        const requiredGrams = targetCarbs / carbsPerGram;

        document.getElementById("calculated-weight").querySelector("span").textContent = requiredGrams.toFixed(2);
    } else {
        alert("אנא בחר מוצר והזן כמות פחמימות חוקית.");
    }
}

// Event listeners
document.getElementById("add-to-list").addEventListener("click", addToList);
document.getElementById("calculate-grams").addEventListener("click", calculateGramsForCarbs);
document.getElementById("clear-history").addEventListener("click", () => {
    historyList = [];
    displayHistory();
    updateTotals();
});

// Load JSON data and initialize search on page load
window.onload = () => {
    loadJSONData().then(setupAutocompleteSearch);
};

const SUPABASE_URL = 'https://nmkxkebbuouxhtqtdtys.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ta3hrZWJidW91eGh0cXRkdHlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMTcwNDgsImV4cCI6MjA5NDg5MzA0OH0.uWzPvdd7k1CDhLFt8oA7mm-FIePSFD6VhPYJcAkRjps';

const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


window.appState = {
    rawPrecos: [],
    rawClima: [],
    rawToneladas: [],
    charts: {},
    currentGranularity: 'diario',
    dateRef: null,
    currentProduto: null,
    topProducerCities: [],
    allProducerCities: [],
    cityClimate: [],
    cityCoordinates: {},
    originTableData: [],
    originSortKey: 'VL_TONELADA',
    originSortAsc: false
};

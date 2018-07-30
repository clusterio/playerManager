module.exports = {
	findInArray: function findInArray(key, value, array){
		let indexes = [];
		for(let i in array){
			if(array[i][key] && array[i][key] === value) indexes.push(i);
		}
		return indexes;
	},
	arrayRemoveDuplicates: function arrayRemoveDuplicates(array){
		let newArray = [];
		array.forEach(value => {
			if(!newArray.includes(value)) newArray.push(value);
		});
		return newArray;
	},
}

/**
 * Address data constants for US and Canada
 * Used by the ShopifyCustomerCreator to generate random addresses
 */

// United States address data
const US_DATA = {
  states: [
    { name: 'California', abbr: 'CA', cities: ['Los Angeles', 'San Francisco', 'San Diego', 'Sacramento', 'San Jose'] },
    { name: 'New York', abbr: 'NY', cities: ['New York City', 'Buffalo', 'Rochester', 'Yonkers', 'Syracuse'] },
    { name: 'Texas', abbr: 'TX', cities: ['Houston', 'Dallas', 'Austin', 'San Antonio', 'Fort Worth'] },
    { name: 'Florida', abbr: 'FL', cities: ['Miami', 'Orlando', 'Tampa', 'Jacksonville', 'Fort Lauderdale'] },
    { name: 'Illinois', abbr: 'IL', cities: ['Chicago', 'Aurora', 'Naperville', 'Joliet', 'Rockford'] },
    { name: 'Washington', abbr: 'WA', cities: ['Seattle', 'Spokane', 'Tacoma', 'Vancouver', 'Bellevue'] },
    { name: 'Pennsylvania', abbr: 'PA', cities: ['Philadelphia', 'Pittsburgh', 'Allentown', 'Erie', 'Reading'] },
    { name: 'Ohio', abbr: 'OH', cities: ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo', 'Akron'] },
  ],
  streetTypes: ['St', 'Ave', 'Blvd', 'Dr', 'Rd', 'Ct', 'Way', 'Pl', 'Ln'],
  streetNames: ['Main', 'Oak', 'Pine', 'Maple', 'Cedar', 'Elm', 'Washington', 'Park', 'Lake', 'Hill', 'Sunset', 'Meadow', 'River', 'Forest', 'Garden', 'Spring', 'Valley', 'Ridge', 'First', 'Second', 'Third', 'Fourth', 'Fifth'],
};

// Canadian address data
const CA_DATA = {
  provinces: [
    { name: 'Ontario', abbr: 'ON', cities: ['Toronto', 'Ottawa', 'Mississauga', 'Brampton', 'Hamilton'] },
    { name: 'Quebec', abbr: 'QC', cities: ['Montreal', 'Quebec City', 'Laval', 'Gatineau', 'Longueuil'] },
    { name: 'British Columbia', abbr: 'BC', cities: ['Vancouver', 'Surrey', 'Burnaby', 'Richmond', 'Abbotsford'] },
    { name: 'Alberta', abbr: 'AB', cities: ['Calgary', 'Edmonton', 'Red Deer', 'Lethbridge', 'Medicine Hat'] },
    { name: 'Manitoba', abbr: 'MB', cities: ['Winnipeg', 'Brandon', 'Steinbach', 'Thompson', 'Portage la Prairie'] },
    { name: 'Saskatchewan', abbr: 'SK', cities: ['Saskatoon', 'Regina', 'Prince Albert', 'Moose Jaw', 'Yorkton'] },
    { name: 'Nova Scotia', abbr: 'NS', cities: ['Halifax', 'Dartmouth', 'Sydney', 'Truro', 'New Glasgow'] },
  ],
  streetTypes: ['St', 'Ave', 'Blvd', 'Dr', 'Rd', 'Crt', 'Way', 'Cres', 'Ln', 'Pl'],
  streetNames: ['Main', 'Oak', 'Pine', 'Maple', 'Cedar', 'Elm', 'King', 'Queen', 'Wellington', 'Bay', 'Yonge', 'Dundas', 'College', 'University', 'Bloor', 'Eglinton', 'Lakeshore', 'Richmond', 'Front', 'Parliament'],
};

module.exports = {
  US_DATA,
  CA_DATA,
};

import Head from 'next/head';
import React, { useEffect, useState } from 'react';

function formatTime(milliseconds:number) {
  let seconds: number | string = Math.floor(milliseconds / 1000);
  let minutes: number | string = Math.floor(seconds / 60);
  let hours: number | string = Math.floor(minutes / 60);

  seconds = seconds % 60;
  minutes = minutes % 60;

  // Padding each unit to ensure two digits
  hours = hours.toString().padStart(2, '0');
  minutes = minutes.toString().padStart(2, '0');
  seconds = seconds.toString().padStart(2, '0');

  return `${hours}:${minutes}:${seconds}`;
}

const Listener = () => {
  const [sortOption, setSortOption] = useState('topSpent');
  const [sortedDomains, setSortedDomains] = useState<any[]>([]);

  useEffect(() => {
    const loadData = () => {
      chrome.storage.local.get('pagesVisited', function (result: any) {
        const pagesVisited = result.pagesVisited || [];
        let domainTimeMap: any = {};

        // Aggregate time by domain
        pagesVisited.forEach((domain: any) => {
          domainTimeMap[domain.domainName] =
            domainTimeMap[domain.domainName] || 0;
          domain.pages.forEach((page: any) => {
            domainTimeMap[domain.domainName] += page.timeSpent ?? 0;
          });
        });

        console.log(domainTimeMap);

        // Convert map to array for sorting
        let sortedDomainsArray = Object.keys(domainTimeMap).map(
          (domainName) => {
            return { domainName, time: domainTimeMap[domainName] };
          }
        );

        // Sorting based on the selected option
        if (sortOption === 'topSpent') {
          sortedDomainsArray.sort((a, b) => b.time - a.time);
        } else if (sortOption === 'recentSpent') {
          // For recentSpent, you need to have a lastVisited timestamp at domain level
          // Assuming you have it, the sorting would be like:
          // sortedDomainsArray.sort((a, b) => b.lastVisited - a.lastVisited);
        }

        setSortedDomains(sortedDomainsArray);
      });
    };

    loadData();
  }, [sortOption]);

  return (
    <>
      <Head>
        <title>Domain Time Tracker</title>
        <style>{`
          body {
            width: 400px !important;
            padding: 10px;
          }

          h1{
            margin-bottom: 16px !important;
          }
        `}</style>
      </Head>

      <div>
        <h1>PageTrail</h1>

        <label htmlFor='sortOptions'>Sort by:</label>
        <select
          id='sortOptions'
          onChange={(e) => setSortOption(e.target.value)}
        >
          <option value='topSpent'>Top Spent</option>
          <option value='recentSpent'>Recent Spent</option>
        </select>

        <div>
          <table>
            <thead>
              <tr>
                <th scope='col'>Domain Name</th>
                <th scope='col'>Time Spent (hh:mm:ss)</th>
              </tr>
            </thead>
            <tbody>
              {sortedDomains.map(
                (domain, index) =>
                  index < 5 && (
                    <tr key={index}>
                      <td>{domain.domainName}</td>
                      <td>{formatTime(domain.time)}</td>
                    </tr>
                  )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

export default Listener;
